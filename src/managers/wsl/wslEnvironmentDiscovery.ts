// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Uri } from 'vscode';
import { PythonCommandRunConfiguration, PythonEnvironment, PythonEnvironmentApi, PythonEnvironmentInfo } from '../../api';
import { traceError, traceInfo } from '../../common/logging';
import { WslPersistenceManager } from './wslPersistence';
import { WslEnvironmentInfo } from './types';

/**
 * Discovers WSL Python environments by reading from the shared persistence file.
 * This provides READ-ONLY access to WSL environments for the vscode-python-environments extension.
 *
 * The persistence file is managed primarily by the vscode-python extension's WslLocator,
 * which performs the actual discovery and validation of WSL environments.
 */
export class WslEnvironmentDiscovery {
    constructor(
        private persistence: WslPersistenceManager,
        private api: PythonEnvironmentApi,
        private manager: any // The environment manager that will own these environments
    ) { }

    /**
     * Discover all WSL environments from the shared persistence file
     */
    async discoverEnvironments(): Promise<PythonEnvironment[]> {
        traceInfo('[WSL Discovery] Starting WSL environment discovery');

        try {
            traceInfo('[WSL Discovery] Loading all environments from persistence...');
            const wslEnvs = await this.persistence.getAllEnvironments();
            const pythonEnvs: PythonEnvironment[] = [];

            traceInfo(`[WSL Discovery] Found ${wslEnvs.size} WSL environments in persistence`);

            if (wslEnvs.size === 0) {
                traceInfo('[WSL Discovery] No environments found in persistence file');
            }

            for (const [envId, info] of wslEnvs) {
                traceInfo(`[WSL Discovery] Processing environment: ${envId}`);
                traceInfo(`[WSL Discovery]   - Distro: ${info.distro}`);
                traceInfo(`[WSL Discovery]   - WSL Path: ${info.wslPath}`);
                traceInfo(`[WSL Discovery]   - Workspace: ${info.workspacePath || 'N/A'}`);

                try {
                    const pythonEnv = this.convertToPythonEnvironment(info, envId);
                    if (pythonEnv) {
                        pythonEnvs.push(pythonEnv);
                        traceInfo(`[WSL Discovery] Successfully converted environment: ${envId}`);
                    } else {
                        traceInfo(`[WSL Discovery] Failed to convert environment (returned undefined): ${envId}`);
                    }
                } catch (err) {
                    traceError(`[WSL Discovery] Error converting environment ${envId}: ${err}`);
                    traceError(`[WSL Discovery] Error stack: ${err instanceof Error ? err.stack : 'No stack trace'}`);
                }
            }

            traceInfo(`[WSL Discovery] Successfully converted ${pythonEnvs.length} WSL environments`);
            traceInfo(`[WSL Discovery] Returning ${pythonEnvs.length} environments`);
            return pythonEnvs;
        } catch (err) {
            traceError(`[WSL Discovery] Error discovering WSL environments: ${err}`);
            traceError(`[WSL Discovery] Error stack: ${err instanceof Error ? err.stack : 'No stack trace'}`);
            return [];
        }
    }

    /**
     * Get WSL environments for a specific workspace
     */
    async getWorkspaceEnvironments(workspacePath: string): Promise<PythonEnvironment[]> {
        traceInfo(`[WSL Discovery] Getting workspace environments for: ${workspacePath}`);

        try {
            const wslEnvs = await this.persistence.getWorkspaceEnvironments(workspacePath);
            traceInfo(`[WSL Discovery] Found ${wslEnvs.length} WSL environments for workspace`);
            const pythonEnvs: PythonEnvironment[] = [];

            for (const info of wslEnvs) {
                const envId = this.generateEnvId(info);
                traceInfo(`[WSL Discovery] Converting workspace environment: ${envId}`);
                const pythonEnv = this.convertToPythonEnvironment(info, envId);
                if (pythonEnv) {
                    pythonEnvs.push(pythonEnv);
                    traceInfo(`[WSL Discovery] Successfully converted: ${envId}`);
                } else {
                    traceInfo(`[WSL Discovery] Failed to convert: ${envId}`);
                }
            }

            traceInfo(`[WSL Discovery] Returning ${pythonEnvs.length} workspace environments`);
            return pythonEnvs;
        } catch (err) {
            traceError(`[WSL Discovery] Error getting workspace environments: ${err}`);
            traceError(`[WSL Discovery] Error stack: ${err instanceof Error ? err.stack : 'No stack trace'}`);
            return [];
        }
    }

    /**
     * Convert WslEnvironmentInfo to PythonEnvironment format
     */
    private convertToPythonEnvironment(info: WslEnvironmentInfo, envId: string): PythonEnvironment | undefined {
        try {
            // Build proper execution configuration for WSL
            const execInfo = this.buildExecutionInfo(info);

            // Create the environment info structure expected by the API
            const envInfo: PythonEnvironmentInfo = {
                name: info.name,
                displayName: `${info.name} (WSL: ${info.distro})`,
                shortDisplayName: info.name,
                displayPath: info.wslPath,
                version: info.pythonVersion || 'Unknown',
                environmentPath: Uri.parse(envId), // Use the encoded path as URI
                description: `WSL ${info.type} environment in ${info.distro}`,
                tooltip: `WSL Path: ${info.wslPath}\nDistro: ${info.distro}\nWorkspace: ${info.workspacePath || 'N/A'}`,
                execInfo,
                sysPrefix: info.sysPrefix,
                group: {
                    name: 'WSL',
                    description: `Windows Subsystem for Linux (${info.distro})`,
                    tooltip: 'Python environments running in WSL',
                }
            };

            // Create the PythonEnvironment using the API
            return this.api.createPythonEnvironmentItem(envInfo, this.manager);
        } catch (err) {
            traceError(`[WSL Discovery] Error creating PythonEnvironment: ${err}`);
            return undefined;
        }
    }

    /**
     * Build execution information for WSL environment
     * This enables proper execution through wsl.exe for Jupyter, terminals, etc.
     */
    private buildExecutionInfo(info: WslEnvironmentInfo): PythonEnvironmentInfo['execInfo'] {
        // For WSL environments, we need to execute through wsl.exe
        // The Python path in WSL format needs to be passed to wsl.exe

        // Build the run configuration (for direct execution)
        const run: PythonCommandRunConfiguration = {
            executable: 'wsl.exe',
            args: ['-d', info.distro, '--', info.wslPath]
        };

        // Build activation configuration for virtual environments
        const activation: PythonCommandRunConfiguration[] | undefined =
            info.type === 'venv' ? this.buildActivationCommands(info) : undefined;

        // Build shell-specific activation commands
        const shellActivation: Map<string, PythonCommandRunConfiguration[]> | undefined =
            info.type === 'venv' ? this.buildShellActivation(info) : undefined;

        // Build deactivation commands
        const deactivation: PythonCommandRunConfiguration[] | undefined =
            info.type === 'venv' ? [{ executable: 'deactivate', args: [] }] : undefined;

        return {
            run,
            activation,
            shellActivation,
            deactivation,
        };
    }

    /**
     * Build activation commands for WSL virtual environment
     */
    private buildActivationCommands(info: WslEnvironmentInfo): PythonCommandRunConfiguration[] {
        // For venv, the activate script is typically at {venv}/bin/activate
        const activateScript = `${info.venvPath}/bin/activate`;

        return [
            {
                executable: 'wsl.exe',
                args: ['-d', info.distro, '--', 'bash', '-c', `source "${activateScript}"`]
            }
        ];
    }

    /**
     * Build shell-specific activation for WSL environment
     * This is used when creating terminals with the environment pre-activated
     */
    private buildShellActivation(info: WslEnvironmentInfo): Map<string, PythonCommandRunConfiguration[]> {
        const shellActivation = new Map<string, PythonCommandRunConfiguration[]>();

        const activateScript = `${info.venvPath}/bin/activate`;

        // Bash activation
        shellActivation.set('bash', [
            { executable: 'source', args: [activateScript] }
        ]);

        // Zsh activation (same as bash)
        shellActivation.set('zsh', [
            { executable: 'source', args: [activateScript] }
        ]);

        // Fish activation (different script)
        shellActivation.set('fish', [
            { executable: 'source', args: [`${info.venvPath}/bin/activate.fish`] }
        ]);

        // PowerShell in WSL (if available)
        shellActivation.set('pwsh', [
            { executable: '.', args: [`${info.venvPath}/bin/Activate.ps1`] }
        ]);

        // Generic fallback for unknown shells
        shellActivation.set('unknown', [
            { executable: 'source', args: [activateScript] }
        ]);

        return shellActivation;
    }

    /**
     * Generate environment ID from WslEnvironmentInfo
     * Format: wsl:distro:path
     */
    private generateEnvId(info: WslEnvironmentInfo): string {
        // Use the same encoding format as vscode-python extension
        return `wsl:${info.distro}:${info.wslPath}`;
    }
}

