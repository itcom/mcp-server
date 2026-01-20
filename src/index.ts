// ハイブリッドMCPサーバー - stdio（Desktop版Claude）+ HTTP（Web版Claude対応）+ Git機能
import { config } from 'dotenv';
config();

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 基本設定
const SERVER_ROOT = process.env.SERVER_ROOT || process.cwd();
const ALLOWED_EXTENSIONS = ['.php', '.js', '.ts', '.tsx', '.json', '.md', '.txt', '.env', '.env.example', '.yaml', '.yml', '.blade.php', '.service', '.conf', '.sh', '.xml', '.bak', '.old', '.new', '.html', '.htm', '.css', '.scss', '.sass', '.rb', '.png', '.gif', '.jpg', '.jpeg', '.svg', '.java', '.jsp', '.properties', '.sql', '.gradle', '.bat', '.vue', '.xls', '.xlsx', '.lock', '.liquid', '.go', '.mod', '.plist', '.swift', '.iss'];
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;
const BASE_URL = process.env.BASE_URL || 'https://mcp.ssl-shop.jp';
const ENDPOINT_PATH = process.env.ENDPOINT_PATH || '/sse';

// プロジェクト識別子の動的生成
const PROJECT_ID = process.env.PROJECT_ID ||
  process.env.MCP_PROJECT_ID ||
  path.basename(SERVER_ROOT).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() ||
  'default';

// サーバー名の動的生成
const SERVER_NAME = process.env.MCP_SERVER_NAME || `${PROJECT_ID}-files-server`;

// 動作モード判定
const MODE = process.env.MCP_MODE || 'auto';
const isHttpArgs = process.argv.includes('--http');
const hasPortEnv = process.env.PORT;
const isStdioMode = MODE === 'stdio' || (MODE === 'auto' && !hasPortEnv && !isHttpArgs);

// 簡素化されたセッション管理
interface WebClaudeSession {
  id: string;
  created: number;
  lastActivity: number;
  active: boolean;
  sseResponse?: Response; // SSE接続保持
}

const webClaudeSessions = new Map<string, WebClaudeSession>();

// 簡素なクリーンアップ（15分間隔）
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of webClaudeSessions.entries()) {
    if (now - (session.lastActivity || session.created) > 30 * 60 * 1000) {
      webClaudeSessions.delete(id);
    }
  }
}, 15 * 60 * 1000);

// ログ関数
function logToStdout(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data || '');
}

function logToStderr(message: string, data?: any) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] Desktop MCP: ${message}`, data || '');
}

// Web版Claude検出
function isWebClaudeClient(userAgent: string): boolean {
  return userAgent.includes('python-httpx') ||
    userAgent.includes('claude') ||
    userAgent.includes('anthropic');
}

// Git操作のヘルパー関数（サブディレクトリ対応版）
async function executeGitCommand(command: string, args: string[] = [], workingDir?: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const cwd = workingDir ? path.resolve(SERVER_ROOT, workingDir) : SERVER_ROOT;
    const { stdout, stderr } = await execAsync(`git ${command} ${args.join(' ')}`, {
      cwd,
      maxBuffer: 1024 * 1024 * 10 // 10MB buffer
    });
    return { stdout, stderr };
  } catch (error: any) {
    throw new Error(`Git command failed: ${error.message}`);
  }
}

// Gitリポジトリの存在チェック（ディレクトリ指定対応）
async function isGitRepository(workingDir?: string): Promise<boolean> {
  try {
    await executeGitCommand('rev-parse', ['--git-dir'], workingDir);
    return true;
  } catch {
    return false;
  }
}

// AI用のコミットメッセージ生成
async function generateCommitMessage(diffOutput: string): Promise<string> {
  const lines = diffOutput.split('\n');
  const changes: string[] = [];
  const files: string[] = [];

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (match) files.push(match[1]);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      changes.push('ADD: ' + line.substring(1).trim());
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      changes.push('DEL: ' + line.substring(1).trim());
    }
  }

  // Laravel固有の変更パターンの検出
  const isController = files.some(f => f.includes('Controller.php'));
  const isModel = files.some(f => f.includes('Models/'));
  const isMigration = files.some(f => f.includes('migrations/'));
  const isView = files.some(f => f.includes('resources/views/'));
  const isRoute = files.some(f => f.includes('routes/'));
  const isConfig = files.some(f => f.includes('config/'));

  let prefix = '';
  if (isMigration) prefix = 'feat(db): ';
  else if (isController) prefix = 'feat(api): ';
  else if (isModel) prefix = 'feat(model): ';
  else if (isView) prefix = 'feat(ui): ';
  else if (isRoute) prefix = 'feat(route): ';
  else if (isConfig) prefix = 'config: ';
  else prefix = 'feat: ';

  // 変更内容の分析
  const summary = changes.slice(0, 3).join(', ').substring(0, 50);
  const fileNames = files.slice(0, 2).map(f => path.basename(f)).join(', ');

  return `${prefix}${fileNames} - ${summary}`;
}

// ファイルシステム操作関数
function sanitizePath(filePath: string): string {
  const fullPath = path.resolve(SERVER_ROOT, filePath);
  if (!fullPath.startsWith(path.resolve(SERVER_ROOT))) {
    throw new Error('Access denied');
  }
  return fullPath;
}

function isAllowedFile(filePath: string): boolean {
  const fileName = path.basename(filePath).toLowerCase();
  const ext = path.extname(filePath).toLowerCase();

  // 複合拡張子のチェック（例：.env.example）
  for (const allowedExt of ALLOWED_EXTENSIONS) {
    if (fileName.endsWith(allowedExt.toLowerCase())) {
      return true;
    }
  }

  // 通常の拡張子チェック
  return ALLOWED_EXTENSIONS.includes(ext) || ext === '';
}

async function getFilesList(dir: string, recursive: boolean, includeHidden: boolean, excludeDirs: string[] = []): Promise<any[]> {
  const files: any[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!includeHidden && entry.name.startsWith('.')) continue;
      if (entry.isDirectory() && excludeDirs.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const stat = await fs.stat(fullPath);

      const fileInfo = {
        name: entry.name,
        path: path.relative(SERVER_ROOT, fullPath),
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stat.size,
        modified: stat.mtime,
        created: stat.birthtime,
      };

      if (entry.isFile() && !isAllowedFile(fullPath)) continue;
      files.push(fileInfo);

      if (recursive && entry.isDirectory()) {
        try {
          const subFiles = await getFilesList(fullPath, recursive, includeHidden, excludeDirs);
          files.push(...subFiles);
        } catch (error) {
          // ディレクトリアクセスエラーをスキップ
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to read directory: ${dir}`);
  }
  return files;
}

// ツール実行関数（Git機能追加版）
async function executeToolCall(toolName: string, toolArgs: any, logFunc: Function): Promise<any> {
  const startTime = Date.now();
  const safeArgs = toolArgs || {};

  logFunc(`Tool execution: ${toolName}`, safeArgs);

  try {
    switch (toolName) {
      // ツール実行関数のGit関連部分（サブディレクトリ対応版）
      case `${PROJECT_ID}_git_status`:
      case 'git_status':
        const statusDir = safeArgs?.directory;
        if (!(await isGitRepository(statusDir))) {
          throw new Error(`Not a git repository${statusDir ? ` in directory: ${statusDir}` : ''}`);
        }

        const { stdout: statusOutput } = await executeGitCommand('status', ['--porcelain', '-b'], statusDir);
        const { stdout: statusLong } = await executeGitCommand('status', [], statusDir);

        return {
          content: [{
            type: "text",
            text: `🔍 【${PROJECT_ID}】Git ステータス${statusDir ? ` (${statusDir})` : ''}\n\n**簡潔表示:**\n${statusOutput}\n\n**詳細表示:**\n${statusLong}`
          }]
        };

      case `${PROJECT_ID}_git_diff`:
      case 'git_diff':
        const diffDir = safeArgs?.directory;
        if (!(await isGitRepository(diffDir))) {
          throw new Error(`Not a git repository${diffDir ? ` in directory: ${diffDir}` : ''}`);
        }

        const staged = safeArgs?.staged || false;
        const diffFilePath = safeArgs?.file_path;

        let diffArgs = staged ? ['--cached'] : [];
        if (diffFilePath) diffArgs.push(diffFilePath);

        const { stdout: diffOutput } = await executeGitCommand('diff', diffArgs, diffDir);

        return {
          content: [{
            type: "text",
            text: `📊 【${PROJECT_ID}】Git 差分${staged ? ' (ステージング済み)' : ''}${diffDir ? ` (${diffDir})` : ''}\n${diffFilePath ? `📄 ファイル: ${diffFilePath}` : ''}\n\n\`\`\`diff\n${diffOutput}\n\`\`\``
          }]
        };

      case `${PROJECT_ID}_git_log`:
      case 'git_log':
        const logDir = safeArgs?.directory;
        if (!(await isGitRepository(logDir))) {
          throw new Error(`Not a git repository${logDir ? ` in directory: ${logDir}` : ''}`);
        }

        const limit = safeArgs?.limit || 10;
        const oneline = safeArgs?.oneline || false;
        const author = safeArgs?.author;
        const since = safeArgs?.since;

        let logArgs = [`--max-count=${limit}`];
        if (oneline) logArgs.push('--oneline');
        else logArgs.push('--pretty=format:%h - %an, %ar : %s');
        if (author) logArgs.push(`--author=${author}`);
        if (since) logArgs.push(`--since=${since}`);

        const { stdout: logOutput } = await executeGitCommand('log', logArgs, logDir);

        return {
          content: [{
            type: "text",
            text: `📚 【${PROJECT_ID}】Git ログ (${limit}件)${logDir ? ` (${logDir})` : ''}\n${author ? `👤 作成者: ${author}\n` : ''}${since ? `📅 期間: ${since}から\n` : ''}\n\n${logOutput}`
          }]
        };

      case `${PROJECT_ID}_git_branch`:
      case 'git_branch':
        const branchDir = safeArgs?.directory;
        if (!(await isGitRepository(branchDir))) {
          throw new Error(`Not a git repository${branchDir ? ` in directory: ${branchDir}` : ''}`);
        }

        const { stdout: branchOutput } = await executeGitCommand('branch', ['-a'], branchDir);
        const { stdout: currentBranch } = await executeGitCommand('branch', ['--show-current'], branchDir);

        return {
          content: [{
            type: "text",
            text: `🌿 【${PROJECT_ID}】Git ブランチ情報${branchDir ? ` (${branchDir})` : ''}\n\n**現在のブランチ:** ${currentBranch.trim()}\n\n**全ブランチ:**\n${branchOutput}`
          }]
        };

      case `${PROJECT_ID}_git_show`:
      case 'git_show':
        const showDir = safeArgs?.directory;
        if (!(await isGitRepository(showDir))) {
          throw new Error(`Not a git repository${showDir ? ` in directory: ${showDir}` : ''}`);
        }

        const commitHash = safeArgs?.commit || 'HEAD';
        const { stdout: showOutput } = await executeGitCommand('show', [commitHash], showDir);

        return {
          content: [{
            type: "text",
            text: `🔍 【${PROJECT_ID}】Git コミット詳細${showDir ? ` (${showDir})` : ''}\n📝 コミット: ${commitHash}\n\n\`\`\`\n${showOutput}\n\`\`\``
          }]
        };

      case `${PROJECT_ID}_git_blame`:
      case 'git_blame':
        const blameDir = safeArgs?.directory;
        if (!(await isGitRepository(blameDir))) {
          throw new Error(`Not a git repository${blameDir ? ` in directory: ${blameDir}` : ''}`);
        }

        const blameFile = safeArgs?.file_path;
        if (!blameFile) throw new Error('file_path is required for git blame');

        const { stdout: blameOutput } = await executeGitCommand('blame', [blameFile], blameDir);

        return {
          content: [{
            type: "text",
            text: `👤 【${PROJECT_ID}】Git Blame${blameDir ? ` (${blameDir})` : ''}\n📄 ファイル: ${blameFile}\n\n\`\`\`\n${blameOutput}\n\`\`\``
          }]
        };

      case `${PROJECT_ID}_git_generate_commit_message`:
      case 'git_generate_commit_message':
        const commitDir = safeArgs?.directory;
        if (!(await isGitRepository(commitDir))) {
          throw new Error(`Not a git repository${commitDir ? ` in directory: ${commitDir}` : ''}`);
        }

        const { stdout: diffForCommit } = await executeGitCommand('diff', ['--cached'], commitDir);
        if (!diffForCommit.trim()) {
          throw new Error('No staged changes found. Please stage changes first with "git add"');
        }

        const generatedMessage = await generateCommitMessage(diffForCommit);

        return {
          content: [{
            type: "text",
            text: `💡 【${PROJECT_ID}】AI生成コミットメッセージ${commitDir ? ` (${commitDir})` : ''}\n\n**推奨メッセージ:**\n\`${generatedMessage}\`\n\n**ステージされた変更の差分:**\n\`\`\`diff\n${diffForCommit.substring(0, 1000)}${diffForCommit.length > 1000 ? '\n... (truncated)' : ''}\n\`\`\``
          }]
        };

      case `${PROJECT_ID}_git_commit_analyze`:
      case 'git_commit_analyze':
        const analyzeDir = safeArgs?.directory;
        if (!(await isGitRepository(analyzeDir))) {
          throw new Error(`Not a git repository${analyzeDir ? ` in directory: ${analyzeDir}` : ''}`);
        }

        const { stdout: statusForAnalyze } = await executeGitCommand('status', ['--porcelain'], analyzeDir);
        const { stdout: diffForAnalyze } = await executeGitCommand('diff', ['--cached'], analyzeDir);

        const lines = statusForAnalyze.split('\n').filter(line => line.trim());
        const analysis = {
          totalFiles: lines.length,
          newFiles: lines.filter(line => line.startsWith('A')).length,
          modifiedFiles: lines.filter(line => line.startsWith('M')).length,
          deletedFiles: lines.filter(line => line.startsWith('D')).length,
          renamedFiles: lines.filter(line => line.startsWith('R')).length,
          suggestion: ''
        };

        if (analysis.totalFiles > 5) {
          analysis.suggestion = '多数のファイルが変更されています。機能ごとに複数のコミットに分割することを検討してください。';
        } else if (analysis.newFiles > 0 && analysis.modifiedFiles > 0) {
          analysis.suggestion = '新規ファイルと既存ファイルの変更が混在しています。機能追加と修正を別々にコミットすることを検討してください。';
        } else {
          analysis.suggestion = '適切なサイズのコミットです。';
        }

        return {
          content: [{
            type: "text",
            text: `📊 【${PROJECT_ID}】コミット分析${analyzeDir ? ` (${analyzeDir})` : ''}\n\n**統計:**\n- 総ファイル数: ${analysis.totalFiles}\n- 新規: ${analysis.newFiles}\n- 変更: ${analysis.modifiedFiles}\n- 削除: ${analysis.deletedFiles}\n- リネーム: ${analysis.renamedFiles}\n\n**推奨事項:**\n${analysis.suggestion}\n\n**変更されたファイル:**\n${statusForAnalyze}`
          }]
        };

      // 既存のファイル操作ツール
      case `${PROJECT_ID}_list_files`:
      case 'list_files':
        const dir = sanitizePath(safeArgs?.directory || ".");
        const files = await getFilesList(
          dir,
          safeArgs?.recursive || false,
          safeArgs?.include_hidden || false,
          safeArgs?.exclude_dirs || ["vendor", "node_modules", "storage", ".git"]
        );

        return {
          content: [{
            type: "text",
            text: `📁 【${PROJECT_ID}】ディレクトリ: ${safeArgs?.directory || '.'}\n📊 ファイル数: ${files.length}\n\n${JSON.stringify(files, null, 2)}`
          }]
        };

      case `${PROJECT_ID}_read_file`:
      case 'read_file':
        if (!safeArgs?.file_path) throw new Error("file_path is required");
        const readFilePath = sanitizePath(safeArgs.file_path);
        if (!isAllowedFile(readFilePath)) throw new Error('File type not allowed');
        const content = await fs.readFile(readFilePath, safeArgs?.encoding || 'utf8');

        return {
          content: [{
            type: "text",
            text: `📄 【${PROJECT_ID}】ファイル: ${safeArgs.file_path}\n📏 サイズ: ${content.length} characters\n\n${content}`
          }]
        };

      case `${PROJECT_ID}_get_laravel_structure`:
      case 'get_laravel_structure':
        const projectPath = sanitizePath(safeArgs?.project_root || ".");
        const includeConfig = safeArgs?.include_config !== false;

        const structure: any = {
          controllers: [],
          models: [],
          views: [],
          routes: [],
          middleware: [],
          migrations: [],
          seeders: [],
          config: []
        };

        try {
          // Controllers
          try {
            const controllersPath = path.join(projectPath, 'app/Http/Controllers');
            structure.controllers = await getFilesList(controllersPath, true, false);
          } catch (e) {
            structure.controllers = [];
          }

          // Models
          try {
            const modelsPath = path.join(projectPath, 'app/Models');
            structure.models = await getFilesList(modelsPath, true, false);
          } catch (e) {
            try {
              const appFiles = await getFilesList(path.join(projectPath, 'app'), false, false);
              structure.models = appFiles.filter(file =>
                file.type === 'file' &&
                file.name.endsWith('.php') &&
                !file.name.includes('Http') &&
                !file.name.includes('Console') &&
                !file.name.includes('Exception')
              );
            } catch (e2) {
              structure.models = [];
            }
          }

          // Views
          try {
            const viewsPath = path.join(projectPath, 'resources/views');
            structure.views = await getFilesList(viewsPath, true, false);
          } catch (e) {
            structure.views = [];
          }

          // Routes
          try {
            const routesPath = path.join(projectPath, 'routes');
            structure.routes = await getFilesList(routesPath, false, false);
          } catch (e) {
            structure.routes = [];
          }

          // Middleware
          try {
            const middlewarePath = path.join(projectPath, 'app/Http/Middleware');
            structure.middleware = await getFilesList(middlewarePath, false, false);
          } catch (e) {
            structure.middleware = [];
          }

          // Migrations
          try {
            const migrationsPath = path.join(projectPath, 'database/migrations');
            structure.migrations = await getFilesList(migrationsPath, false, false);
          } catch (e) {
            structure.migrations = [];
          }

          // Seeders
          try {
            const seedersPath = path.join(projectPath, 'database/seeders');
            structure.seeders = await getFilesList(seedersPath, false, false);
          } catch (e) {
            structure.seeders = [];
          }

          // Config
          if (includeConfig) {
            try {
              const configPath = path.join(projectPath, 'config');
              structure.config = await getFilesList(configPath, false, false);
            } catch (e) {
              structure.config = [];
            }
          }

          const stats = {
            totalControllers: structure.controllers.length,
            totalModels: structure.models.length,
            totalViews: structure.views.length,
            totalRoutes: structure.routes.length,
            totalMiddleware: structure.middleware.length,
            totalMigrations: structure.migrations.length,
            totalSeeders: structure.seeders.length,
            totalConfig: structure.config.length,
            analyzed: new Date().toISOString()
          };

          return {
            content: [{
              type: "text",
              text: `🏗️ 【${PROJECT_ID}】Laravel構造分析\n📂 プロジェクト: ${safeArgs?.project_root || '.'}\n📊 統計: ${stats.totalControllers}個のコントローラー, ${stats.totalModels}個のモデル\n\n**統計情報:**\n${JSON.stringify(stats, null, 2)}\n\n**詳細構造:**\n${JSON.stringify(structure, null, 2)}`
            }]
          };

        } catch (error) {
          throw new Error(`Laravel構造の分析に失敗: ${error instanceof Error ? error.message : String(error)}`);
        }

      case `${PROJECT_ID}_search_files`:
      case 'search_files':
        const searchPath = sanitizePath(safeArgs?.directory || ".");
        const pattern = safeArgs?.pattern;
        const contentSearch = safeArgs?.content_search;
        const fileExtension = safeArgs?.file_extension;
        const excludeDirs = safeArgs?.exclude_dirs || ["vendor", "node_modules", "storage", ".git"];

        try {
          const allFiles = await getFilesList(searchPath, true, false, excludeDirs);
          const results: any[] = [];

          for (const file of allFiles) {
            if (file.type === 'directory') continue;

            let matches = true;

            if (pattern) {
              const regex = new RegExp(pattern as string, 'i');
              matches = matches && regex.test(file.name);
            }

            if (fileExtension) {
              matches = matches && file.name.toLowerCase().endsWith((fileExtension as string).toLowerCase());
            }

            if (contentSearch && matches) {
              try {
                const fullPath = path.resolve(SERVER_ROOT, file.path);
                if (isAllowedFile(fullPath)) {
                  const content = await fs.readFile(fullPath, 'utf8');
                  matches = matches && content.toLowerCase().includes((contentSearch as string).toLowerCase());

                  if (matches) {
                    const lines = content.split('\n');
                    const matchingLines: Array<{ line: number, content: string }> = [];

                    lines.forEach((line, index) => {
                      if (line.toLowerCase().includes((contentSearch as string).toLowerCase())) {
                        matchingLines.push({
                          line: index + 1,
                          content: line.trim()
                        });
                      }
                    });

                    file.matchContext = {
                      totalMatches: matchingLines.length,
                      firstFewMatches: matchingLines.slice(0, 3)
                    };
                  }
                } else {
                  matches = false;
                }
              } catch (error) {
                matches = false;
              }
            }

            if (matches) {
              results.push(file);
            }
          }

          results.sort((a, b) => {
            if (contentSearch && a.matchContext && b.matchContext) {
              return b.matchContext.totalMatches - a.matchContext.totalMatches;
            }
            return a.name.localeCompare(b.name);
          });

          const searchSummary = {
            query: {
              directory: safeArgs?.directory || ".",
              pattern: pattern || "なし",
              contentSearch: contentSearch || "なし",
              fileExtension: fileExtension || "なし",
              excludeDirs: excludeDirs
            },
            results: {
              totalFiles: allFiles.filter(f => f.type === 'file').length,
              matchedFiles: results.length,
              searchTime: `${Date.now() - startTime}ms`
            }
          };

          return {
            content: [{
              type: "text",
              text: `🔍 【${PROJECT_ID}】ファイル検索結果\n📂 検索範囲: ${safeArgs?.directory || '.'}\n📊 結果: ${results.length}件のファイルがマッチ\n\n**検索条件:**\n${JSON.stringify(searchSummary.query, null, 2)}\n\n**検索結果:**\n${JSON.stringify(searchSummary.results, null, 2)}\n\n**マッチしたファイル:**\n${JSON.stringify(results, null, 2)}`
            }]
          };

        } catch (error) {
          throw new Error(`ファイル検索に失敗: ${error instanceof Error ? error.message : String(error)}`);
        }

      case `${PROJECT_ID}_get_server_info`:
      case 'get_server_info':
        const serverInfo = {
          projectId: PROJECT_ID,
          serverName: SERVER_NAME,
          serverRoot: SERVER_ROOT,
          nodeVersion: process.version,
          platform: process.platform,
          uptime: Math.round(process.uptime()),
          allowedExtensions: ALLOWED_EXTENSIONS,
          timestamp: new Date().toISOString(),
          version: "13.0.0",
          protocol: isStdioMode ? "Desktop Claude Compatible" : "HTTP Remote Compatible",
          transport: isStdioMode ? "stdio" : "http",
          mode: MODE,
          activeSessions: webClaudeSessions.size,
          gitRepository: await isGitRepository(),
          features: [
            "stdio",
            "http",
            "file-operations",
            "laravel-support",
            "session-management",
            "oauth-authentication",
            "web-claude-optimized",
            "git-integration",
            "ai-commit-messages"
          ]
        };

        return {
          content: [{
            type: "text",
            text: `🖥️ 【${PROJECT_ID}】サーバー情報\n⚡ ${serverInfo.protocol}\n📡 プロトコル: ${serverInfo.transport}\n📊 アクティブセッション: ${serverInfo.activeSessions}個\n🔧 Git: ${serverInfo.gitRepository ? '✅' : '❌'}\n\n${JSON.stringify(serverInfo, null, 2)}`
          }]
        };

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logFunc(`Tool error: ${toolName} (${duration}ms)`, {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

// ツール定義（Git機能追加版）
const TOOLS: Tool[] = [
  // Git関連ツール
  {
    name: PROJECT_ID + "_git_status",
    description: `【${PROJECT_ID}】Gitリポジトリの現在の状態を表示します`,
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Gitリポジトリのディレクトリパス（省略時はルート）' }
      }
    }
  },
  {
    name: PROJECT_ID + "_git_diff",
    description: `【${PROJECT_ID}】Git差分を表示します`,
    inputSchema: {
      type: 'object',
      properties: {
        staged: { type: 'boolean', default: false, description: 'ステージング済みの変更を表示' },
        file_path: { type: 'string', description: '特定ファイルの差分を表示' },
        directory: { type: 'string', description: 'Gitリポジトリのディレクトリパス（省略時はルート）' }
      }
    }
  },
  {
    name: PROJECT_ID + "_git_log",
    description: `【${PROJECT_ID}】Gitコミット履歴を表示します`,
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 10, description: '表示件数' },
        oneline: { type: 'boolean', default: false, description: '1行形式で表示' },
        author: { type: 'string', description: '特定の作成者でフィルタ' },
        since: { type: 'string', description: '期間指定 (例: "1 week ago")' },
        directory: { type: 'string', description: 'Gitリポジトリのディレクトリパス（省略時はルート）' }
      }
    }
  },
  {
    name: PROJECT_ID + "_git_branch",
    description: `【${PROJECT_ID}】Gitブランチ情報を表示します`,
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Gitリポジトリのディレクトリパス（省略時はルート）' }
      }
    }
  },
  {
    name: PROJECT_ID + "_git_show",
    description: `【${PROJECT_ID}】特定のコミットの詳細を表示します`,
    inputSchema: {
      type: 'object',
      properties: {
        commit: { type: 'string', default: 'HEAD', description: 'コミットハッシュまたはHEAD' },
        directory: { type: 'string', description: 'Gitリポジトリのディレクトリパス（省略時はルート）' }
      }
    }
  },
  {
    name: PROJECT_ID + "_git_blame",
    description: `【${PROJECT_ID}】ファイルの行ごとの変更履歴を表示します`,
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'ファイルパス' },
        directory: { type: 'string', description: 'Gitリポジトリのディレクトリパス（省略時はルート）' }
      },
      required: ['file_path']
    }
  },
  {
    name: PROJECT_ID + "_git_generate_commit_message",
    description: `【${PROJECT_ID}】現在の変更内容からAIがコミットメッセージを生成します`,
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Gitリポジトリのディレクトリパス（省略時はルート）' }
      }
    }
  },
  {
    name: PROJECT_ID + "_git_commit_analyze",
    description: `【${PROJECT_ID}】現在の変更内容を分析してコミット分割を提案します`,
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Gitリポジトリのディレクトリパス（省略時はルート）' }
      }
    }
  },

  // 既存のファイル操作ツール
  {
    name: PROJECT_ID + "_list_files",
    description: `【${PROJECT_ID}】ディレクトリ内のファイル一覧を取得します`,
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', default: '.' },
        recursive: { type: 'boolean', default: false },
        include_hidden: { type: 'boolean', default: false },
        exclude_dirs: {
          type: 'array',
          items: { type: 'string' },
          default: ['vendor', 'node_modules', 'storage', '.git']
        }
      }
    }
  },
  {
    name: PROJECT_ID + "_read_file",
    description: `【${PROJECT_ID}】ファイルの内容を読み取ります`,
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        encoding: { type: 'string', default: 'utf8' }
      },
      required: ['file_path']
    }
  },
  {
    name: PROJECT_ID + "_get_laravel_structure",
    description: `【${PROJECT_ID}】Laravelプロジェクトの構造を取得します`,
    inputSchema: {
      type: 'object',
      properties: {
        project_root: { type: 'string', default: '.' },
        include_config: { type: 'boolean', default: true }
      }
    }
  },
  {
    name: PROJECT_ID + "_search_files",
    description: `【${PROJECT_ID}】ファイル検索を行います`,
    inputSchema: {
      type: 'object',
      properties: {
        directory: { type: 'string', default: '.' },
        pattern: { type: 'string' },
        content_search: { type: 'string' },
        file_extension: { type: 'string' },
        exclude_dirs: {
          type: 'array',
          items: { type: 'string' },
          default: ['vendor', 'node_modules', 'storage', '.git']
        }
      }
    }
  },
  {
    name: PROJECT_ID + "_get_server_info",
    description: `【${PROJECT_ID}】サーバー情報を取得します`,
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// MCP JSON-RPC処理（resources/list と prompts/list を追加）
async function handleMcpRequest(request: any): Promise<any> {
  const { jsonrpc, id, method, params } = request;

  if (jsonrpc !== "2.0") {
    return {
      jsonrpc: "2.0",
      id: id || null,
      error: { code: -32600, message: "Invalid Request" }
    };
  }

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: true },
            prompts: {},
            resources: {}
          },
          serverInfo: {
            name: SERVER_NAME,
            version: "13.0.0",
            description: "Git機能付きMCPサーバー"
          }
        }
      };

    case 'tools/list':
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS }
      };

    case 'tools/call':
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      if (!toolName) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Tool name is required" }
        };
      }

      try {
        const result = await executeToolCall(toolName, toolArgs, logToStdout);
        return { jsonrpc: "2.0", id, result };
      } catch (toolError) {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32603,
            message: `Tool execution failed: ${toolError instanceof Error ? toolError.message : String(toolError)}`
          }
        };
      }

    case 'notifications/initialized':
      return undefined;

    case 'resources/list':
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not found" }
      };

    case 'prompts/list':
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not found" }
      };

    case 'ping':
      return {
        jsonrpc: "2.0",
        id: id || null,
        result: {
          status: "pong",
          timestamp: new Date().toISOString(),
          version: "13.0.0"
        }
      };

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` }
      };
  }
}

// Desktop版Claude専用 stdio実装
class DesktopClaudeMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: '13.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logToStderr('Tools list requested', { count: TOOLS.length });
      return { tools: TOOLS };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      try {
        const result = await executeToolCall(name, args, logToStderr);
        return result;
      } catch (error) {
        logToStderr('Tool execution failed', { error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    logToStderr('Desktop Claude MCP Server started', {
      version: '13.0.0',
      projectId: PROJECT_ID,
      mode: 'stdio',
      gitSupport: await isGitRepository()
    });

    await this.server.connect(transport);

    process.on('SIGINT', async () => {
      logToStderr('Shutting down gracefully...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logToStderr('Shutting down gracefully...');
      await this.server.close();
      process.exit(0);
    });
  }
}

// HTTPサーバー実装
async function createHttpServer() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // CORS設定
  app.use((req: Request, res: Response, next: NextFunction): void => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');

    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Web版Claude用正しい仕様実装
  // GET /sse → SSE接続 + endpoint情報発行
  app.get(ENDPOINT_PATH, (req: Request, res: Response): void => {
    const sessionId = randomUUID();

    // SSE接続確立
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, mcp-session-id',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Expose-Headers': 'mcp-session-id',
      'Access-Control-Max-Age': '86400',
      'X-Accel-Buffering': 'no'
    });

    // セッション保存（SSE接続も保持）
    webClaudeSessions.set(sessionId, {
      id: sessionId,
      created: Date.now(),
      lastActivity: Date.now(),
      active: true,
      sseResponse: res
    });

    // Web版Claude用の特別なendpointイベント送信
    res.write(`event: endpoint\ndata: ${ENDPOINT_PATH}/message?sessionId=${sessionId}\n\n`);

    // クリーンアップ処理
    req.on('close', () => {
      const session = webClaudeSessions.get(sessionId);
      if (session) {
        session.active = false;
        webClaudeSessions.delete(sessionId);
      }
    });

    res.on('close', () => {
      const session = webClaudeSessions.get(sessionId);
      if (session) {
        session.active = false;
        webClaudeSessions.delete(sessionId);
      }
    });

    logToStdout('Web版Claude SSE接続確立', { sessionId: sessionId.substring(0, 8) });
  });

  // POST /sse/message → JSON-RPC通信（SSE経由でレスポンス）
  app.post(ENDPOINT_PATH + '/message', async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.query.sessionId as string;

    // セッション検証
    const session = webClaudeSessions.get(sessionId);
    if (!session || !session.active || !session.sseResponse) {
      res.status(401).json({
        error: "invalid_session",
        message: "Session not found or expired"
      });
      return;
    }

    try {
      // MCP JSON-RPC処理
      const response = await handleMcpRequest(req.body);

      // セッション活動更新
      session.lastActivity = Date.now();
      webClaudeSessions.set(sessionId, session);

      // SSE経由でレスポンス送信（Web版Claude仕様に準拠）
      if (session.sseResponse && !session.sseResponse.destroyed) {
        session.sseResponse.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
      }

      // POST requestには HTTP 202 Accepted を返す
      res.status(202).setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.send('Accepted');

      logToStdout('Web版Claude JSON-RPC処理', {
        sessionId: sessionId.substring(0, 8),
        method: req.body?.method
      });

    } catch (error) {
      // エラーもSSE経由で送信
      if (session.sseResponse && !session.sseResponse.destroyed) {
        const errorResponse = {
          jsonrpc: "2.0",
          id: req.body?.id || null,
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : String(error)
          }
        };
        session.sseResponse.write(`event: message\ndata: ${JSON.stringify(errorResponse)}\n\n`);
      }

      res.status(202).send('Accepted');
    }
  });

  // 基本OAuth実装（簡素化）
  app.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    res.json({
      "issuer": BASE_URL,
      "authorization_endpoint": BASE_URL + "/authorize",
      "token_endpoint": BASE_URL + "/token",
      "scopes_supported": ["claudeai", "mcp"],
      "response_types_supported": ["code"],
      "grant_types_supported": ["authorization_code", "refresh_token"]
    });
  });

  app.get('/authorize', (req: Request, res: Response): void => {
    const { client_id, redirect_uri, response_type, scope, state } = req.query;

    if (!redirect_uri || !client_id || response_type !== 'code') {
      res.status(400).json({
        "error": "invalid_request",
        "error_description": "Missing required parameters"
      });
      return;
    }

    const authCode = `auth_${PROJECT_ID}_${Date.now()}_${Math.random().toString(36).substring(2)}`;

    try {
      const redirectUrl = new URL(redirect_uri as string);
      redirectUrl.searchParams.set('code', authCode);
      if (state) redirectUrl.searchParams.set('state', state as string);
      res.redirect(redirectUrl.toString());
    } catch (error) {
      res.status(400).json({
        "error": "invalid_request",
        "error_description": "Invalid redirect_uri format"
      });
    }
  });

  app.post('/token', (req: Request, res: Response): void => {
    const { grant_type, code, refresh_token } = req.body;

    if (grant_type === 'authorization_code' && code) {
      const accessToken = `mcp_${PROJECT_ID}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      const refreshTokenValue = `refresh_${PROJECT_ID}_${Date.now()}_${Math.random().toString(36).substring(2)}`;

      res.json({
        "access_token": accessToken,
        "token_type": "Bearer",
        "expires_in": 3600,
        "refresh_token": refreshTokenValue,
        "scope": "claudeai mcp"
      });
    } else if (grant_type === 'refresh_token' && refresh_token) {
      const newAccessToken = `mcp_${PROJECT_ID}_${Date.now()}_${Math.random().toString(36).substring(2)}`;
      res.json({
        "access_token": newAccessToken,
        "token_type": "Bearer",
        "expires_in": 3600,
        "scope": "claudeai mcp"
      });
    } else {
      res.status(400).json({
        "error": "unsupported_grant_type",
        "error_description": `Grant type '${grant_type}' is not supported`
      });
    }
  });

  // ヘルスチェック
  app.get('/health', async (req: Request, res: Response) => {
    res.json({
      status: 'OK',
      server: 'Git機能付きMCPサーバー',
      version: '13.0.0',
      projectId: PROJECT_ID,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      activeSessions: webClaudeSessions.size,
      gitRepository: await isGitRepository(),
      capabilities: ['stdio', 'http', 'web-claude-optimized', 'git-integration', 'ai-commit-messages']
    });
  });

  return app;
}

// メイン実行部分
async function main() {
  try {
    if (isStdioMode) {
      console.error('[2025-06-09] Starting Desktop Claude stdio mode with Git support...');
      const server = new DesktopClaudeMCPServer();
      await server.run();
    } else {
      console.log('[2025-06-09] Starting HTTP remote mode with Git support...');
      const app = await createHttpServer();
      const actualPort = PORT;

      app.listen(actualPort, () => {
        logToStdout(`🚀 Git機能付きMCPサーバー起動 (HTTP Mode)`);
        logToStdout(`📡 Web版Claude: ${BASE_URL}${ENDPOINT_PATH}`);
        logToStdout(`❤️ ヘルスチェック: ${BASE_URL}/health`);
        logToStdout(`✅ HTTPサーバー起動完了 (Port: ${actualPort})`);
      });
    }
  } catch (error) {
    console.error('Failed to start MCP Server:', error);
    process.exit(1);
  }
}

// エラーハンドリング
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

main().catch(console.error);
