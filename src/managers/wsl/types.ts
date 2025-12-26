// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Information about a WSL Python environment
 * This matches the structure used in vscode-python extension for consistency
 */
export interface WslEnvironmentInfo {
    /** WSL distribution name (e.g., "Ubuntu-22.04") */
    distro: string;
    /** Path to Python executable in WSL format (e.g., "/mnt/c/workspace/.venv/bin/python") */
    wslPath: string;
    /** Path to the venv directory in WSL format (e.g., "/mnt/c/workspace/.venv") */
    venvPath: string;
    /** Windows workspace path associated with this environment (e.g., "c:\\workspace") */
    workspacePath?: string;
    /** Environment name (e.g., ".venv", "venv2") */
    name: string;
    /** Type of environment */
    type: 'venv' | 'system' | 'other';
    /** ISO timestamp when environment was first discovered */
    createdAt: string;
    /** ISO timestamp when environment was last used */
    lastUsed: string;
    /** Python version (e.g., "3.11.0") */
    pythonVersion?: string;
    /** sys.prefix value */
    sysPrefix: string;
}

/**
 * Structure of the shared persistence file
 */
export interface WslPersistenceData {
    version: string;
    environments: { [envId: string]: WslEnvironmentInfo };
    workspaceMapping: { [workspacePath: string]: string[] };
}



