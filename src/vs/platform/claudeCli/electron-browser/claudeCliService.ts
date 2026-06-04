/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerMainProcessRemoteService } from '../../ipc/electron-browser/services.js';
import { IClaudeCliService } from '../common/claudeCli.js';

// Delegate all IClaudeCliService calls to the main process via IPC.
// The actual implementation (ClaudeCliMainService) runs in electron-main where
// Node.js APIs (child_process, http, fs) are available.
registerMainProcessRemoteService(IClaudeCliService, 'claudeCli');
