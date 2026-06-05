/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/kanbanView.css';
import * as dom from '../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IViewPaneOptions, ViewPane } from '../../../../workbench/browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../../workbench/common/views.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

export const KANBAN_VIEW_CONTAINER_ID = 'workbench.sessions.kanbanContainer';
export const KANBAN_VIEW_ID = 'workbench.sessions.kanbanView';

interface IKanbanColumn {
	readonly cssClass: string;
	readonly label: string;
	readonly filter: (session: ISession) => boolean;
}

function getColumns(): IKanbanColumn[] {
	return [
		{ cssClass: 'planning', label: localize('kanban.planning', 'Planning'), filter: s => s.status.get() === SessionStatus.InProgress && s.changes.get().length === 0 },
		{ cssClass: 'in-progress', label: localize('kanban.inProgress', 'In Progress'), filter: s => s.status.get() === SessionStatus.InProgress && s.changes.get().length > 0 },
		{ cssClass: 'for-review', label: localize('kanban.forReview', 'For Review'), filter: s => s.status.get() === SessionStatus.NeedsInput },
		{ cssClass: 'done', label: localize('kanban.done', 'Done'), filter: s => s.status.get() === SessionStatus.Completed || s.status.get() === SessionStatus.Error },
	];
}

function formatRelativeTime(date: Date): string {
	const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
	if (seconds < 60) {
		return localize('kanban.time.now', 'just now');
	}
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) {
		return localize('kanban.time.min', '{0}m ago', minutes);
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return localize('kanban.time.hr', '{0}h ago', hours);
	}
	return localize('kanban.time.day', '{0}d ago', Math.floor(hours / 24));
}

export class KanbanViewPane extends ViewPane {

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('agent-sessions-kanban');

		const columns = getColumns();
		const columnBodies = new Map<string, HTMLElement>();
		const columnCounts = new Map<string, HTMLElement>();

		for (const col of columns) {
			const colEl = dom.append(container, dom.$('.kanban-column.' + col.cssClass));
			const header = dom.append(colEl, dom.$('.kanban-column-header'));
			dom.append(header, dom.$('span.kanban-column-title', undefined, col.label));
			const countEl = dom.append(header, dom.$('span.kanban-column-count', undefined, '0'));
			const body = dom.append(colEl, dom.$('.kanban-column-body'));
			columnBodies.set(col.cssClass, body);
			columnCounts.set(col.cssClass, countEl);
		}

		const renderDisposables = this._register(new DisposableStore());

		const render = () => {
			renderDisposables.clear();

			const sessions = this.sessionsManagementService.getSessions()
				.filter(s => !s.isArchived.get());

			for (const col of columns) {
				const body = columnBodies.get(col.cssClass)!;
				const countEl = columnCounts.get(col.cssClass)!;

				const matching = sessions.filter(s => col.filter(s));
				dom.clearNode(body);
				countEl.textContent = String(matching.length);

				if (matching.length === 0) {
					dom.append(body, dom.$('div.kanban-empty', undefined,
						localize('kanban.empty', 'No sessions')));
					continue;
				}

				const sorted = [...matching].sort(
					(a, b) => b.updatedAt.get().getTime() - a.updatedAt.get().getTime()
				);

				for (const session of sorted) {
					this._renderCard(body, col.cssClass, session, renderDisposables);
				}
			}
		};

		render();

		this._register(this.sessionsManagementService.onDidChangeSessions(() => render()));
	}

	private _renderCard(
		parent: HTMLElement,
		columnCssClass: string,
		session: ISession,
		disposables: DisposableStore,
	): void {
		const card = dom.append(parent, dom.$('div.kanban-card.' + columnCssClass));
		card.tabIndex = 0;

		const titleRow = dom.append(card, dom.$('div.kanban-card-title-row'));

		const status = session.status.get();
		if (status === SessionStatus.InProgress) {
			dom.append(titleRow, dom.$('span.kanban-card-status-dot.in-progress'));
		} else if (status === SessionStatus.NeedsInput) {
			dom.append(titleRow, dom.$('span.kanban-card-status-dot.for-review'));
		}

		dom.append(titleRow, dom.$('span.kanban-card-title', undefined, session.title.get()));

		const meta = dom.append(card, dom.$('div.kanban-card-meta'));

		const workspace = session.workspace.get();
		dom.append(meta, dom.$('span.kanban-card-workspace', undefined, workspace?.label ?? ''));

		const right = dom.append(meta, dom.$('div.kanban-card-meta-right'));

		const changes = session.changes.get();
		if (changes.length > 0) {
			dom.append(right, dom.$('span.kanban-card-changes', undefined,
				localize('kanban.files', '{0}', changes.length)));
		}

		dom.append(right, dom.$('span.kanban-card-time', undefined,
			formatRelativeTime(session.updatedAt.get())));

		disposables.add(dom.addDisposableListener(card, dom.EventType.CLICK, () => {
			this.sessionsManagementService.openSession(session.resource).catch(onUnexpectedError);
		}));

		disposables.add(dom.addDisposableListener(card, dom.EventType.KEY_DOWN, (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				this.sessionsManagementService.openSession(session.resource).catch(onUnexpectedError);
			}
		}));
	}

}
