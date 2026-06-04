/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable, derived, derivedOpts, IObservable, ObservablePromise } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { GitDiffChange, IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { IChatSessionFileChange2 } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { ISessionChangeset, ISessionFileChange, ISessionWorkspace, sessionFileChangesEqual, SessionStatus } from '../../../../services/sessions/common/session.js';

function toFileChanges(diffs: readonly GitDiffChange[]): IChatSessionFileChange2[] {
	return diffs.map(change => ({
		uri: change.uri,
		originalUri: change.originalUri
			? change.originalUri.with({ scheme: 'git', query: JSON.stringify({ path: change.originalUri.fsPath, ref: 'HEAD' }) })
			: undefined,
		modifiedUri: change.modifiedUri,
		insertions: change.insertions,
		deletions: change.deletions,
	} satisfies IChatSessionFileChange2));
}

/**
 * Changeset that surfaces uncommitted git changes in the session workspace.
 *
 * Refreshes when:
 * - Claude writes or edits a file (fileEditCountObs increments)
 * - The session finishes (status → Completed/Error catches Bash-based edits)
 */
export class ClaudeCliSessionChangeset implements ISessionChangeset {
	static readonly ID = 'claude-cli-session-changes';
	readonly id = ClaudeCliSessionChangeset.ID;
	readonly label = localize('claudeCliSessionChanges', 'Session Changes');
	readonly description = localize('claudeCliSessionChangesDesc', 'Files modified by Claude Code in this session');
	readonly category = localize('changesCategory', 'Changes');

	readonly isEnabled: IObservable<boolean>;
	readonly isDefault: IObservable<boolean>;
	readonly isLoadingChanges: IObservable<boolean>;
	readonly changes: IObservable<readonly ISessionFileChange[]>;
	readonly originalCheckpointRef = constObservable<string | undefined>('HEAD');
	readonly modifiedCheckpointRef = constObservable<string | undefined>(undefined);

	constructor(
		workspaceObs: IObservable<ISessionWorkspace | undefined>,
		statusObs: IObservable<SessionStatus>,
		fileEditCountObs: IObservable<number>,
		gitService: IGitService,
	) {
		this.isEnabled = derived(reader => {
			const status = statusObs.read(reader);
			return status === SessionStatus.InProgress
				|| status === SessionStatus.Completed
				|| status === SessionStatus.Error;
		});

		this.isDefault = constObservable(true);

		const changesPromiseObs = derived(reader => {
			const repoUri = workspaceObs.read(reader)?.folders[0]?.root;
			const editCount = fileEditCountObs.read(reader);
			const status = statusObs.read(reader);

			// Defer until Claude has made at least one tracked edit, or the session
			// has completed (which catches edits made via Bash).
			const sessionDone = status === SessionStatus.Completed || status === SessionStatus.Error;
			if (!repoUri || (editCount === 0 && !sessionDone)) {
				return constObservable<readonly IChatSessionFileChange2[] | undefined>([]);
			}

			const diffPromise = gitService.openRepository(repoUri).then(async repo => {
				if (!repo) { return []; }
				const diffs = await repo.diffBetweenWithStats2('HEAD');
				return toFileChanges(diffs);
			});

			return new ObservablePromise(diffPromise).resolvedValue;
		});

		this.isLoadingChanges = derived(reader =>
			changesPromiseObs.read(reader).read(reader) === undefined
		);

		this.changes = derivedOpts({ equalsFn: sessionFileChangesEqual }, reader =>
			changesPromiseObs.read(reader).read(reader) ?? []
		);
	}
}
