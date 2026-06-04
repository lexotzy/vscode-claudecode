/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../workbench/common/contributions.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ClaudeCliSessionsProvider } from './claudeCliSessionsProvider.js';

// ---------------------------------------------------------------------------
// Setting IDs
// ---------------------------------------------------------------------------

export const CLAUDE_CLI_ENABLED_SETTING = 'claudeCode.enabled';
export const CLAUDE_CLI_PATH_SETTING = 'claudeCode.path';

// ---------------------------------------------------------------------------
// Configuration schema
// ---------------------------------------------------------------------------

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'claudeCode',
	title: localize('claudeCode.title', 'Claude Code'),
	properties: {
		[CLAUDE_CLI_ENABLED_SETTING]: {
			type: 'boolean',
			default: true,
			tags: ['experimental'],
			markdownDescription: localize(
				'claudeCode.enabled.description',
				'When enabled, Claude Code sessions are available in the Sessions panel. Requires the `claude` CLI to be installed.',
			),
		},
		[CLAUDE_CLI_PATH_SETTING]: {
			type: 'string',
			default: '',
			markdownDescription: localize(
				'claudeCode.path.description',
				'Absolute path to the `claude` CLI binary. Leave empty to use auto-discovery (checks common install locations and PATH). Example: `/usr/local/bin/claude`.',
			),
		},
	},
});

// ---------------------------------------------------------------------------
// Contribution
// ---------------------------------------------------------------------------

class ClaudeCliProviderContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'sessions.claudeCliProvider';

	private readonly _providerDisposable = this._register(new MutableDisposable());

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();
		this._syncEnabled();
		this._register(
			this._configurationService.onDidChangeConfiguration(e => {
				if (e.affectsConfiguration(CLAUDE_CLI_ENABLED_SETTING)) {
					this._syncEnabled();
				}
			}),
		);
	}

	private _syncEnabled(): void {
		const enabled = this._configurationService.getValue<boolean>(CLAUDE_CLI_ENABLED_SETTING) !== false;
		if (enabled && !this._providerDisposable.value) {
			const provider = this._instantiationService.createInstance(ClaudeCliSessionsProvider);
			const reg = this._sessionsProvidersService.registerProvider(provider);
			this._providerDisposable.value = { dispose: () => { reg.dispose(); provider.dispose(); } };
		} else if (!enabled) {
			this._providerDisposable.clear();
		}
	}
}

registerWorkbenchContribution2(ClaudeCliProviderContribution.ID, ClaudeCliProviderContribution, WorkbenchPhase.AfterRestored);
