/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, DisposableMap } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ISettableObservable, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { basename, dirname } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IClaudeCliService, IPermissionRequest } from '../../../../../platform/claudeCli/common/claudeCli.js';
import { ClaudeCliStreamEvent, isAssistantEvent, isResultEvent, isSystemInitEvent, isTextBlock, isToolUseBlock } from '../../../../../platform/claudeCli/common/streamJson.js';
import {
	IChat, IChatCheckpoints, ISession, ISessionCapabilities, ISessionChangeset,
	ISessionFolder, ISessionType, ISessionWorkspace, SessionStatus,
	SESSION_WORKSPACE_GROUP_LOCAL, toSessionId,
} from '../../../../services/sessions/common/session.js';
import { ISendRequestOptions, ISessionChangeEvent, ISessionModelPickerOptions, ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { ClaudeCliSessionChangeset } from './claudeCliChangesets.js';

// ---------------------------------------------------------------------------
// Session type & provider constants
// ---------------------------------------------------------------------------

export const ClaudeCliSessionType: ISessionType = {
	id: 'claude-cli',
	label: localize('claudeCliSession', 'Claude Code'),
	icon: Codicon.robot,
};

const CLAUDE_CLI_PROVIDER_ID = 'claude-cli';

// Tool names that write or modify files — used to trigger changeset refresh.
const FILE_EDITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

// ---------------------------------------------------------------------------
// Internal session model
// ---------------------------------------------------------------------------

/**
 * Mutable internal model for a single Claude Code CLI session.
 * Owns all observable state; the ISession facade is built from it.
 */
class ClaudeCliChatModel extends Disposable {

	readonly resource: URI;
	readonly sessionId: string;
	readonly providerId = CLAUDE_CLI_PROVIDER_ID;
	readonly sessionType = ClaudeCliSessionType.id;
	readonly icon: ThemeIcon = ClaudeCliSessionType.icon;
	readonly createdAt = new Date();

	private readonly _title = observableValue<string>(this, '');
	readonly title = this._title;

	private readonly _updatedAt = observableValue<Date>(this, new Date());
	readonly updatedAt = this._updatedAt;

	private readonly _status = observableValue<SessionStatus>(this, SessionStatus.Untitled);
	readonly status = this._status;

	private readonly _description = observableValue<{ value: string } | undefined>(this, undefined);
	readonly description = this._description;

	private readonly _workspaceData = observableValue<ISessionWorkspace | undefined>(this, undefined);
	readonly workspace = this._workspaceData;

	private readonly _lastTurnEnd = observableValue<Date | undefined>(this, undefined);
	readonly lastTurnEnd = this._lastTurnEnd;

	readonly mainChat: ISettableObservable<IChat>;

	private readonly _isArchived = observableValue<boolean>(this, false);
	readonly isArchived = this._isArchived;

	/** Increments each time Claude writes or edits a file; drives changeset refresh. */
	private readonly _fileEditCount = observableValue<number>(this, 0);
	readonly fileEditCount = this._fileEditCount;

	/** Changeset that surfaces uncommitted git changes for this session. */
	readonly changeset: ClaudeCliSessionChangeset;

	/** Session ID reported by the CLI result event (for --continue). */
	lastCliSessionId: string | undefined;
	/** Whether this session has ever been sent (graduated from new → active). */
	isSent = false;

	constructor(workspaceUri: URI, gitService: IGitService) {
		super();
		this.resource = workspaceUri.with({ scheme: 'claude-cli-session', path: `/${Date.now()}` });
		this.sessionId = toSessionId(CLAUDE_CLI_PROVIDER_ID, this.resource);
		this.mainChat = observableValue<IChat>(this, this._buildChat());
		this.changeset = new ClaudeCliSessionChangeset(
			this.workspace,
			this.status,
			this.fileEditCount,
			gitService,
		);
	}

	incrementFileEditCount(): void {
		this._fileEditCount.set(this._fileEditCount.get() + 1, undefined);
	}

	setTitle(title: string): void { this._title.set(title, undefined); }
	setStatus(status: SessionStatus): void { this._status.set(status, undefined); }
	setDescription(value: string | undefined): void {
		this._description.set(value ? { value } : undefined, undefined);
	}
	setUpdatedAt(date: Date): void { this._updatedAt.set(date, undefined); }
	setLastTurnEnd(date: Date): void { this._lastTurnEnd.set(date, undefined); }
	setWorkspace(ws: ISessionWorkspace): void { this._workspaceData.set(ws, undefined); }
	setArchived(archived: boolean): void { this._isArchived.set(archived, undefined); }

	private _buildChat(): IChat {
		return {
			resource: this.resource,
			createdAt: this.createdAt,
			title: this.title,
			updatedAt: this.updatedAt,
			status: this.status,
			changes: constObservable([]),
			checkpoints: constObservable<IChatCheckpoints | undefined>(undefined),
			modelId: constObservable(undefined),
			mode: constObservable(undefined),
			isArchived: constObservable(false),
			isRead: constObservable(true),
			description: this.description,
			lastTurnEnd: this.lastTurnEnd,
		};
	}
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class ClaudeCliSessionsProvider extends Disposable implements ISessionsProvider {

	readonly id = CLAUDE_CLI_PROVIDER_ID;
	readonly label = localize('claudeCliProvider', 'Claude Code');
	readonly icon: ThemeIcon = Codicon.robot;
	readonly order = 10;

	readonly sessionTypes: readonly ISessionType[] = [ClaudeCliSessionType];

	private readonly _onDidChangeSessionTypes = this._register(new Emitter<void>());
	readonly onDidChangeSessionTypes = this._onDidChangeSessionTypes.event;

	private readonly _onDidChangeSessions = this._register(new Emitter<ISessionChangeEvent>());
	readonly onDidChangeSessions = this._onDidChangeSessions.event;

	readonly onDidChangeModels: Event<void> = Event.None;

	readonly browseActions = [];
	readonly supportsLocalWorkspaces = true;

	/** New sessions not yet sent. */
	private readonly _newSessions = new DisposableMap<string, ClaudeCliChatModel>();
	/** Committed sessions. */
	private readonly _sessions = new Map<string, ClaudeCliChatModel>();

	constructor(
		@IClaudeCliService private readonly _claudeCliService: IClaudeCliService,
		@ILogService private readonly _logService: ILogService,
		@ILabelService private readonly _labelService: ILabelService,
		@IGitService private readonly _gitService: IGitService,
		@IDialogService private readonly _dialogService: IDialogService,
	) {
		super();
	}

	// -- Workspace --

	resolveWorkspace(uri: URI): ISessionWorkspace | undefined {
		if (uri.scheme !== Schemas.file) {
			return undefined;
		}
		const folder: ISessionFolder = {
			root: uri,
			workingDirectory: uri,
			name: basename(uri),
			description: undefined,
			gitRepository: undefined,
		};
		return {
			uri,
			label: basename(uri),
			description: this._labelService.getUriLabel(dirname(uri), { relative: false }),
			group: SESSION_WORKSPACE_GROUP_LOCAL,
			icon: Codicon.folder,
			folders: [folder],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		};
	}

	getSessionTypes(workspaceUri: URI): ISessionType[] {
		if (workspaceUri.scheme !== Schemas.file) {
			return [];
		}
		return [ClaudeCliSessionType];
	}

	// -- Session Listing --

	getSessions(): ISession[] {
		return [...this._sessions.values()].filter(m => !m.isArchived.get()).map(m => this._toISession(m));
	}

	// -- Session Lifecycle --

	createNewSession(workspaceUri: URI, sessionTypeId: string): ISession {
		if (sessionTypeId !== ClaudeCliSessionType.id) {
			throw new Error(`[ClaudeCliProvider] Unsupported session type '${sessionTypeId}'`);
		}
		const workspace = this.resolveWorkspace(workspaceUri);
		if (!workspace) {
			throw new Error(`[ClaudeCliProvider] Cannot resolve workspace for: ${workspaceUri.toString()}`);
		}
		const model = this._register(new ClaudeCliChatModel(workspaceUri, this._gitService));
		model.setWorkspace(workspace);
		this._newSessions.set(model.sessionId, model);
		return this._toISession(model);
	}

	deleteNewSession(sessionId: string): void {
		this._newSessions.deleteAndDispose(sessionId);
	}

	// -- Models --

	getModels(_sessionId: string): readonly ILanguageModelChatMetadataAndIdentifier[] {
		return [];
	}

	getModelPickerOptions(_sessionId: string): ISessionModelPickerOptions {
		return {
			useGroupedModelPicker: false,
			showFeatured: false,
			showUnavailableFeatured: false,
			showManageModelsAction: false,
		};
	}

	setModel(_sessionId: string, _modelId: string): void {
		// Claude Code CLI manages its own model via CLI configuration
	}

	// -- Session Actions --

	async archiveSession(sessionId: string): Promise<void> {
		const model = this._findModel(sessionId);
		if (model) {
			model.setArchived(true);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(model)] });
		}
	}

	async unarchiveSession(sessionId: string): Promise<void> {
		const model = this._findModel(sessionId);
		if (model) {
			model.setArchived(false);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(model)] });
		}
	}

	async deleteSession(sessionId: string): Promise<void> {
		const model = this._findModel(sessionId);
		if (!model) {
			return;
		}
		const iSession = this._toISession(model);
		const workspaceRoot = model.workspace.get()?.folders[0]?.root;
		if (workspaceRoot) {
			this._claudeCliService.stopSession(workspaceRoot);
		}
		this._sessions.delete(model.sessionId);
		this._newSessions.deleteAndDispose(model.sessionId);
		model.dispose();
		this._onDidChangeSessions.fire({ added: [], removed: [iSession], changed: [] });
	}

	async deleteChat(sessionId: string, _chatUri: URI): Promise<void> {
		// No multi-chat support — deleting the chat deletes the whole session
		return this.deleteSession(sessionId);
	}

	async renameChat(_sessionId: string, _chatUri: URI, title: string): Promise<void> {
		const model = this._findModel(_sessionId);
		if (model) {
			model.setTitle(title);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [this._toISession(model)] });
		}
	}

	async createNewChat(sessionId: string, _prompt?: string): Promise<IChat> {
		// Single-chat sessions only — return the existing main chat
		const model = this._findModel(sessionId) ?? this._newSessions.get(sessionId);
		if (!model) {
			throw new Error(`[ClaudeCliProvider] Session '${sessionId}' not found`);
		}
		return model.mainChat.get();
	}

	// -- Send Request --

	async sendRequest(sessionId: string, _chatResource: URI, options: ISendRequestOptions): Promise<ISession> {
		const newModel = this._newSessions.get(sessionId);
		const existingModel = this._sessions.get(sessionId);
		const model = newModel ?? existingModel;

		if (!model) {
			throw new Error(`[ClaudeCliProvider] Session '${sessionId}' not found`);
		}

		if (!this._claudeCliService.isAvailable) {
			throw new Error('[ClaudeCliProvider] Claude Code CLI not found. Install from https://claude.ai/code');
		}

		const workspaceUri = model.workspace.get()?.folders[0]?.root;
		if (!workspaceUri) {
			throw new Error('[ClaudeCliProvider] No workspace folder available for session');
		}

		// Set initial state
		const title = options.query.split('\n')[0].substring(0, 100) || localize('newSession', 'New Session');
		model.setTitle(title);
		model.setStatus(SessionStatus.InProgress);
		model.setUpdatedAt(new Date());
		model.setDescription(localize('claudeCli.starting', 'Starting Claude Code…'));

		const iSession = this._toISession(model);

		// Publish session if this is the first send
		if (newModel) {
			this._newSessions.deleteAndLeak(sessionId);
			this._sessions.set(sessionId, model);
			model.isSent = true;
			this._onDidChangeSessions.fire({ added: [iSession], removed: [], changed: [] });
		} else {
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
		}

		// Start the CLI process — resume prior conversation when possible.
		const resumeId = model.isSent ? model.lastCliSessionId : undefined;
		const cliSession = this._claudeCliService.startSession(workspaceUri, options.query, sessionId, resumeId);

		// Wire up stream events → observable state
		this._register(cliSession.onDidEmitEvent(event => {
			this._handleStreamEvent(model, event, iSession);
		}));

		this._register(cliSession.onPermissionRequest(req => {
			this._handlePermissionRequest(req, cliSession);
		}));

		this._register(cliSession.onDidExit(code => {
			const now = new Date();
			if (model.status.get() === SessionStatus.InProgress) {
				model.setStatus(code === 0 ? SessionStatus.Completed : SessionStatus.Error);
			}
			if (code !== 0) {
				model.setDescription(localize('claudeCli.exitError', 'Claude Code exited with code {0}', code));
			} else {
				model.setDescription(undefined);
			}
			model.setLastTurnEnd(now);
			model.setUpdatedAt(now);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
			this._logService.info(`[ClaudeCliProvider] Session ${sessionId} CLI process exited with code ${code}`);
		}));

		return iSession;
	}

	// -- Private helpers --

	private _handleStreamEvent(model: ClaudeCliChatModel, event: ClaudeCliStreamEvent, iSession: ISession): void {
		if (isSystemInitEvent(event)) {
			model.setDescription(localize('claudeCli.initialized', 'Claude Code initialized'));
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
			return;
		}

		if (isAssistantEvent(event)) {
			const content = event.message.content;
			let desc: string | undefined;
			for (const block of content) {
				if (isTextBlock(block) && block.text.trim()) {
					const truncated = block.text.length > 120 ? block.text.substring(0, 120) + '…' : block.text;
					desc = truncated;
					break;
				}
				if (isToolUseBlock(block)) {
					desc = localize('claudeCli.toolUse', 'Running: {0}', block.name);
					break;
				}
			}
			// Increment file-edit counter when Claude writes or modifies a file,
			// so the changeset triggers a git diff refresh.
			if (content.some(b => isToolUseBlock(b) && FILE_EDITING_TOOLS.has(b.name))) {
				model.incrementFileEditCount();
			}
			if (desc !== undefined) {
				model.setDescription(desc);
				model.setUpdatedAt(new Date());
				this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
			}
			return;
		}

		if (isResultEvent(event)) {
			const now = new Date();
			model.lastCliSessionId = event.session_id;
			model.setStatus(event.is_error ? SessionStatus.Error : SessionStatus.Completed);
			model.setDescription(event.is_error ? event.result : undefined);
			model.setLastTurnEnd(now);
			model.setUpdatedAt(now);
			this._onDidChangeSessions.fire({ added: [], removed: [], changed: [iSession] });
		}
	}

	private async _handlePermissionRequest(req: IPermissionRequest, session: import('../../../../../platform/claudeCli/common/claudeCli.js').IClaudeCliSession): Promise<void> {
		const detail = this._formatPermissionDetail(req.toolName, req.toolInput);
		const result = await this._dialogService.confirm({
			type: 'question',
			title: localize('claudeCli.permissionTitle', 'Allow tool use?'),
			message: localize('claudeCli.permissionMsg', 'Claude Code wants to run: {0}', req.toolName),
			detail,
			primaryButton: localize('claudeCli.allow', 'Allow'),
		});
		session.respondToPermission(req.requestId, result.confirmed);
		this._logService.info(`[ClaudeCliProvider] permission for '${req.toolName}' → ${result.confirmed ? 'allowed' : 'denied'}`);
	}

	private _formatPermissionDetail(toolName: string, input: Record<string, unknown>): string {
		const lines: string[] = [];
		for (const [key, val] of Object.entries(input)) {
			const str = typeof val === 'string' ? val : JSON.stringify(val);
			lines.push(`${key}: ${str.length > 120 ? str.slice(0, 120) + '…' : str}`);
			if (lines.length >= 4) {
				break;
			}
		}
		return lines.length > 0 ? lines.join('\n') : toolName;
	}

	private _findModel(sessionId: string): ClaudeCliChatModel | undefined {
		return this._sessions.get(sessionId) ?? this._newSessions.get(sessionId);
	}

	private _toISession(model: ClaudeCliChatModel): ISession {
		const singleChatObs = model.mainChat;
		const chatsObs = singleChatObs.map(chat => [chat] as readonly IChat[]);
		const changesets = constObservable<readonly ISessionChangeset[]>([model.changeset]);

		return {
			sessionId: model.sessionId,
			resource: model.resource,
			providerId: model.providerId,
			sessionType: model.sessionType,
			icon: model.icon,
			createdAt: model.createdAt,
			workspace: model.workspace,
			title: model.title,
			updatedAt: model.updatedAt,
			status: model.status,
			changes: constObservable([]),
			changesets,
			modelId: constObservable(undefined),
			mode: constObservable(undefined),
			loading: constObservable(false),
			isArchived: model.isArchived,
			isRead: constObservable(true),
			description: model.description,
			lastTurnEnd: model.lastTurnEnd,
			chats: chatsObs,
			mainChat: singleChatObs,
			capabilities: {
				supportsMultipleChats: false,
			} satisfies ISessionCapabilities,
		};
	}

	override dispose(): void {
		for (const model of this._sessions.values()) {
			model.dispose();
		}
		this._sessions.clear();
		super.dispose();
	}
}
