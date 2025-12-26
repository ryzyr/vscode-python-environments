// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Disposable, ExtensionContext, LogOutputChannel, Uri } from 'vscode';
import { PythonEnvironmentApi } from '../../api';
import { traceInfo } from '../../common/logging';
import { WslEnvironmentDiscovery } from './wslEnvironmentDiscovery';
import { WslPersistenceManager } from './wslPersistence';

/**
 * Register WSL environment discovery features.
 *
 * Note: This is a READ-ONLY integration for now. It discovers WSL environments
 * from the shared persistence file managed by the vscode-python extension.
 *
 * For full WSL support (creation, activation, package management, etc.),
 * see the WSL_ROADMAP.md document.
 */
export async function registerWslFeatures(
    context: ExtensionContext,
    _disposables: Disposable[],
    log: LogOutputChannel,
    api: PythonEnvironmentApi
): Promise<void> {
    try {
        traceInfo('[WSL] Registering WSL environment discovery features');

        // IMPORTANT: Use the same storage path as vscode-python extension
        // This ensures both extensions read from and write to the SAME persistence file
        const wslStoragePath = Uri.joinPath(context.globalStorageUri, 'wsl-environments.json').fsPath;
        traceInfo(`[WSL] Creating persistence manager with path: ${wslStoragePath}`);

        // Create persistence manager (reads from shared file)
        const persistence = new WslPersistenceManager(wslStoragePath);

        // Log the persistence file location for debugging
        traceInfo(`[WSL] Using persistence file: ${persistence.getPersistenceFilePath()}`);

        // Create a minimal "manager" object for the discovery
        // This is not a full EnvironmentManager - just used for grouping
        const wslPseudoManager = {
            name: 'wsl',
            displayName: 'WSL',
            preferredPackageManagerId: 'ms-python.python:pip',
            description: 'Windows Subsystem for Linux Python environments',
        };

        // Create discovery instance
        const discovery = new WslEnvironmentDiscovery(persistence, api, wslPseudoManager);

        // Discover WSL environments and add them to the system
        // Note: These environments are discovered from the persistence file
        // The vscode-python extension's WslLocator manages the actual discovery and persistence
        const wslEnvironments = await discovery.discoverEnvironments();

        if (wslEnvironments.length > 0) {
            traceInfo(`[WSL] Discovered ${wslEnvironments.length} WSL environments`);

            // Note: The environments are created using api.createPythonEnvironmentItem()
            // They will automatically appear in the environment list
        } else {
            traceInfo('[WSL] No WSL environments found in persistence');
        }

        // TODO: Add file watcher to refresh when persistence file changes
        // TODO: Implement proper EnvironmentManager for full lifecycle support
        // See WSL_ROADMAP.md for details

    } catch (error) {
        log.error(`[WSL] Error registering WSL features: ${error}`);
        traceInfo(`[WSL] WSL features registration failed, continuing without WSL support`);
    }
}

