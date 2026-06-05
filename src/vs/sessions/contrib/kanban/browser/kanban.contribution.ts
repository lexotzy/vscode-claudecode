/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { IViewContainersRegistry, ViewContainerLocation, IViewsRegistry, Extensions as ViewContainerExtensions, WindowEnablement } from '../../../../workbench/common/views.js';
import { ViewPaneContainer } from '../../../../workbench/browser/parts/views/viewPaneContainer.js';
import { KANBAN_VIEW_CONTAINER_ID, KANBAN_VIEW_ID, KanbanViewPane } from './kanbanView.js';

const kanbanViewIcon = registerIcon('kanban-view-icon', Codicon.project, localize2('kanbanViewIcon', 'View icon for the Agents kanban board.').value);

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);

viewContainersRegistry.registerViewContainer({
	id: KANBAN_VIEW_CONTAINER_ID,
	title: localize2('agents', 'Agents'),
	icon: kanbanViewIcon,
	order: 12,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [KANBAN_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	storageId: KANBAN_VIEW_CONTAINER_ID,
	hideIfEmpty: false,
	windowEnablement: WindowEnablement.Sessions,
}, ViewContainerLocation.AuxiliaryBar, { isDefault: true });

const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

viewsRegistry.registerViews([{
	id: KANBAN_VIEW_ID,
	name: localize2('agents', 'Agents'),
	containerIcon: kanbanViewIcon,
	ctorDescriptor: new SyncDescriptor(KanbanViewPane),
	canToggleVisibility: false,
	canMoveView: false,
	weight: 100,
	windowEnablement: WindowEnablement.Sessions,
}], viewContainersRegistry.get(KANBAN_VIEW_CONTAINER_ID)!);
