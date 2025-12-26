// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { traceError, traceInfo } from '../../common/logging';
import { WslEnvironmentInfo, WslPersistenceData } from './types';

/**
 * Manages persistence of WSL Python environment information.
 * This reads from the SAME file as the vscode-python extension for consistency.
 *
 * Location: ~/.vscode/python-wsl-environments.json
 */
export class WslPersistenceManager {
	private readonly persistenceFilePath: string;
	private cache: WslPersistenceData | undefined;
	private readonly CURRENT_VERSION = '1.0';

	constructor(customPath?: string) {
		if (customPath) {
			this.persistenceFilePath = customPath;
		} else {
			// Use AppData on Windows, ~/.local/share on Linux/Mac for proper app data storage
			let appDataDir: string;

			if (process.platform === 'win32') {
				// Windows: Use %APPDATA%\vscode-python\
				appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
				appDataDir = path.join(appDataDir, 'vscode-python');
			} else if (process.platform === 'darwin') {
				// macOS: Use ~/Library/Application Support/vscode-python/
				appDataDir = path.join(os.homedir(), 'Library', 'Application Support', 'vscode-python');
			} else {
				// Linux: Use ~/.local/share/vscode-python/
				appDataDir = path.join(os.homedir(), '.local', 'share', 'vscode-python');
			}

			this.persistenceFilePath = path.join(appDataDir, 'wsl-environments.json');
			traceInfo(`[WSL Persistence] Using fallback persistence file path: ${this.persistenceFilePath}`);
		}
	}

	/**
	 * Get all WSL environments from persistence
	 */
	async getAllEnvironments(): Promise<Map<string, WslEnvironmentInfo>> {
		const data = await this.loadData();
		return new Map(Object.entries(data.environments));
	}

	/**
	 * Get all WSL environments associated with a workspace
	 */
	async getWorkspaceEnvironments(workspacePath: string): Promise<WslEnvironmentInfo[]> {
		traceInfo(`[WSL Persistence] getWorkspaceEnvironments called for: ${workspacePath}`);
		const data = await this.loadData();
		const normalizedPath = this.normalizePath(workspacePath);
		traceInfo(`[WSL Persistence] Normalized path: ${normalizedPath}`);
		const envIds = data.workspaceMapping[normalizedPath] || [];
		traceInfo(`[WSL Persistence] Found ${envIds.length} environment IDs in mapping`);

		const environments: WslEnvironmentInfo[] = [];
		for (const envId of envIds) {
			const env = data.environments[envId];
			if (env) {
				environments.push(env);
				traceInfo(`[WSL Persistence] Loaded environment: ${envId}`);
			} else {
				traceInfo(`[WSL Persistence] Environment ID not found in data: ${envId}`);
			}
		}

		traceInfo(`[WSL Persistence] Returning ${environments.length} environments for workspace: ${workspacePath}`);
		return environments;
	}

	/**
	 * Get a specific environment by ID
	 */
	async getEnvironment(envId: string): Promise<WslEnvironmentInfo | undefined> {
		const data = await this.loadData();
		return data.environments[envId];
	}

	/**
	 * Check if an environment exists in persistence
	 */
	async hasEnvironment(envId: string): Promise<boolean> {
		const data = await this.loadData();
		return envId in data.environments;
	}

	/**
	 * Load data from persistence file
	 */
	private async loadData(): Promise<WslPersistenceData> {
		// Return cached data if available
		if (this.cache) {
			traceInfo(`[WSL Persistence] Returning cached data (${Object.keys(this.cache.environments).length} environments)`);
			return this.cache;
		}

		traceInfo(`[WSL Persistence] Loading data from: ${this.persistenceFilePath}`);

		try {
			// Ensure the directory exists
			await fs.ensureDir(path.dirname(this.persistenceFilePath));
			traceInfo(`[WSL Persistence] Directory ensured: ${path.dirname(this.persistenceFilePath)}`);

			// Check if file exists
			if (await fs.pathExists(this.persistenceFilePath)) {
				traceInfo(`[WSL Persistence] File exists, reading...`);
				const content = await fs.readFile(this.persistenceFilePath, 'utf-8');
				const data = JSON.parse(content) as WslPersistenceData;

				// Validate version
				if (data.version !== this.CURRENT_VERSION) {
					traceInfo(`[WSL Persistence] Version mismatch. Expected ${this.CURRENT_VERSION}, got ${data.version}. Creating new file.`);
					return this.createEmptyData();
				}

				this.cache = data;
				traceInfo(`[WSL Persistence] Loaded ${Object.keys(data.environments).length} environments from disk`);
				return data;
			}

			// File doesn't exist, return empty data
			traceInfo(`[WSL Persistence] File does not exist, returning empty data`);
			return this.createEmptyData();
		} catch (error) {
			traceError(`[WSL Persistence] Error loading data: ${error}`);
			return this.createEmptyData();
		}
	}

	/**
	 * Create empty persistence data structure
	 */
	private createEmptyData(): WslPersistenceData {
		return {
			version: this.CURRENT_VERSION,
			environments: {},
			workspaceMapping: {},
		};
	}

	/**
	 * Normalize path for consistent comparison (lowercase on Windows)
	 */
	private normalizePath(filePath: string): string {
		// Normalize path separators and case
		const normalized = path.normalize(filePath);
		// On Windows, paths are case-insensitive
		return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
	}

	/**
	 * Get the persistence file path (useful for debugging)
	 */
	getPersistenceFilePath(): string {
		return this.persistenceFilePath;
	}

	/**
	 * Clear the cache (useful when file is updated externally)
	 */
	clearCache(): void {
		this.cache = undefined;
	}
}

