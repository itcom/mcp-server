import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';

const app = express();
app.use(express.json());

// セキュリティ: アクセス可能なパスを制限
const SERVER_ROOT = process.env.SERVER_ROOT || process.cwd();
const ALLOWED_EXTENSIONS = ['.php', '.js', '.ts', '.json', '.md', '.txt', '.env.example', '.yaml', '.yml', '.blade.php'];
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

function sanitizePath(filePath: string): string {
  const fullPath = path.resolve(SERVER_ROOT, filePath);
  
  if (!fullPath.startsWith(path.resolve(SERVER_ROOT))) {
    throw new Error('アクセス権限がありません');
  }
  
  return fullPath;
}

function isAllowedFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_EXTENSIONS.includes(ext) || ext === '';
}

// セッション管理用のマップ
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

// ヘルパー関数
async function getFilesList(dir: string, recursive: boolean, includeHidden: boolean, excludeDirs: string[] = []): Promise<any[]> {
  const files: any[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!includeHidden && entry.name.startsWith('.')) {
      continue;
    }

    if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
      continue;
    }

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

    if (entry.isFile() && !isAllowedFile(fullPath)) {
      continue;
    }

    files.push(fileInfo);

    if (recursive && entry.isDirectory()) {
      const subFiles = await getFilesList(fullPath, recursive, includeHidden, excludeDirs);
      files.push(...subFiles);
    }
  }

  return files;
}

async function searchFiles(
  dir: string, 
  pattern?: string, 
  contentSearch?: string, 
  fileExtension?: string,
  excludeDirs: string[] = ["vendor", "node_modules", "storage", ".git"]
): Promise<any[]> {
  const results: any[] = [];
  const files = await getFilesList(dir, true, false, excludeDirs);

  for (const file of files) {
    if (file.type === 'directory') continue;

    let matches = true;

    if (pattern) {
      const regex = new RegExp(pattern, 'i');
      matches = matches && regex.test(file.name);
    }

    if (fileExtension) {
      matches = matches && file.name.endsWith(fileExtension);
    }

    if (contentSearch && matches) {
      try {
        const fullPath = path.resolve(SERVER_ROOT, file.path);
        const content = await fs.readFile(fullPath, 'utf8');
        matches = matches && content.includes(contentSearch);
      } catch (error) {
        matches = false;
      }
    }

    if (matches) {
      results.push(file);
    }
  }

  return results;
}

async function getLaravelStructure(projectRoot: string, includeConfig: boolean): Promise<any> {
  const structure: any = {
    controllers: [],
    models: [],
    views: [],
    routes: [],
    middleware: [],
    migrations: [],
    seeders: [],
  };

  if (includeConfig) {
    structure.config = [];
  }

  try {
    // Controllers
    const controllersPath = path.join(projectRoot, 'app/Http/Controllers');
    try {
      structure.controllers = await getFilesList(controllersPath, true, false);
    } catch (e) {}

    // Models
    const modelsPath = path.join(projectRoot, 'app/Models');
    try {
      structure.models = await getFilesList(modelsPath, true, false);
    } catch (e) {
      const appFiles = await getFilesList(path.join(projectRoot, 'app'), false, false);
      structure.models = appFiles.filter(file => 
        file.type === 'file' && 
        file.name.endsWith('.php') && 
        !file.name.includes('Http')
      );
    }

    // Views
    const viewsPath = path.join(projectRoot, 'resources/views');
    try {
      structure.views = await getFilesList(viewsPath, true, false);
    } catch (e) {}

    // Routes
    const routesPath = path.join(projectRoot, 'routes');
    try {
      structure.routes = await getFilesList(routesPath, false, false);
    } catch (e) {}

    // Middleware
    const middlewarePath = path.join(projectRoot, 'app/Http/Middleware');
    try {
      structure.middleware = await getFilesList(middlewarePath, false, false);
    } catch (e) {}

    // Migrations
    const migrationsPath = path.join(projectRoot, 'database/migrations');
    try {
      structure.migrations = await getFilesList(migrationsPath, false, false);
    } catch (e) {}

    // Seeders
    const seedersPath = path.join(projectRoot, 'database/seeders');
    try {
      structure.seeders = await getFilesList(seedersPath, false, false);
    } catch (e) {}

    // Config
    if (includeConfig) {
      const configPath = path.join(projectRoot, 'config');
      try {
        structure.config = await getFilesList(configPath, false, false);
      } catch (e) {}
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Laravel構造の取得に失敗しました: ${errorMessage}`);
  }

  return structure;
}

// MCPサーバーの作成
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "remote-file-operations-server",
    version: "1.0.0"
  });

  // ツールの定義
  server.tool(
    "list_files",
    {
      directory: z.string().default(".").describe("ファイル一覧を取得するディレクトリのパス"),
      recursive: z.boolean().default(false).describe("サブディレクトリも含めて再帰的に取得するか"),
      include_hidden: z.boolean().default(false).describe("隠しファイル（.で始まるファイル）も含めるか"),
      exclude_dirs: z.array(z.string()).default(["vendor", "node_modules", "storage", ".git", "bootstrap/cache"]).describe("除外するディレクトリ名")
    },
    async ({ directory, recursive, include_hidden, exclude_dirs }) => {
      const fullPath = sanitizePath(directory);
      const files = await getFilesList(fullPath, recursive, include_hidden, exclude_dirs);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(files, null, 2)
        }]
      };
    }
  );

  server.tool(
    "get_file_info",
    {
      file_path: z.string().describe("情報を取得するファイルのパス")
    },
    async ({ file_path }) => {
      const filePath = sanitizePath(file_path);
      
      if (!isAllowedFile(filePath)) {
        throw new Error('このファイル形式は許可されていません');
      }
      
      const stat = await fs.stat(filePath);
      const fileInfo = {
        path: path.relative(SERVER_ROOT, filePath),
        name: path.basename(filePath),
        size: stat.size,
        isFile: stat.isFile(),
        isDirectory: stat.isDirectory(),
        created: stat.birthtime,
        modified: stat.mtime,
        accessed: stat.atime,
        permissions: stat.mode.toString(8),
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(fileInfo, null, 2)
        }]
      };
    }
  );

  server.tool(
    "read_file",
    {
      file_path: z.string().describe("読み取るファイルのパス"),
      encoding: z.string().default("utf8").describe("ファイルの文字エンコーディング")
    },
    async ({ file_path, encoding }) => {
      const filePath = sanitizePath(file_path);
      
      if (!isAllowedFile(filePath)) {
        throw new Error('このファイル形式は許可されていません');
      }
      
      const content = await fs.readFile(filePath, encoding as BufferEncoding);
      
      return {
        content: [{
          type: "text",
          text: content
        }]
      };
    }
  );

  server.tool(
    "search_files",
    {
      directory: z.string().default(".").describe("検索するディレクトリのパス"),
      pattern: z.string().optional().describe("ファイル名の検索パターン（正規表現）"),
      content_search: z.string().optional().describe("ファイル内容の検索文字列"),
      file_extension: z.string().optional().describe("検索対象のファイル拡張子（例: .js, .php）"),
      exclude_dirs: z.array(z.string()).default(["vendor", "node_modules", "storage", ".git"]).describe("除外するディレクトリ名")
    },
    async ({ directory, pattern, content_search, file_extension, exclude_dirs }) => {
      const fullPath = sanitizePath(directory);
      const results = await searchFiles(fullPath, pattern, content_search, file_extension, exclude_dirs);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(results, null, 2)
        }]
      };
    }
  );

  server.tool(
    "get_laravel_structure",
    {
      project_root: z.string().default(".").describe("Laravelプロジェクトのルートディレクトリ"),
      include_config: z.boolean().default(true).describe("設定ファイルも含めるか")
    },
    async ({ project_root, include_config }) => {
      const fullPath = sanitizePath(project_root);
      const structure = await getLaravelStructure(fullPath, include_config);
      
      return {
        content: [{
          type: "text",
          text: JSON.stringify(structure, null, 2)
        }]
      };
    }
  );

  server.tool(
    "get_server_info",
    {},
    async () => {
      const serverInfo = {
        serverRoot: SERVER_ROOT,
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        workingDirectory: process.cwd(),
        allowedExtensions: ALLOWED_EXTENSIONS,
        timestamp: new Date().toISOString(),
      };

      return {
        content: [{
          type: "text",
          text: JSON.stringify(serverInfo, null, 2)
        }]
      };
    }
  );

  return server;
}

// Streamable HTTP用のMCPエンドポイント
app.post('/mcp', async (req, res) => {
  try {
    // セッションIDをヘッダーから取得
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // 既存のセッションを再利用
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // 新しい初期化リクエスト
      const newSessionId = randomUUID();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId
      });

      const server = createMcpServer();
      await server.connect(transport);
      
      transports[newSessionId] = transport;
      console.log(`新しいセッションを作成しました: ${newSessionId}`);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        id: req.body.id || null,
        error: {
          code: -32000,
          message: "Invalid request: missing session ID or not an initialization request"
        }
      });
      return;
    }

    // StreamableHTTPServerTransportを使用してリクエストを処理
    await transport.handleRequest(req, res);
    
  } catch (error) {
    console.error('MCP request error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id || null,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal server error'
        }
      });
    }
  }
});

// DELETEリクエストでセッション終了をサポート
app.delete('/mcp', (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  
  if (sessionId && transports[sessionId]) {
    delete transports[sessionId];
    console.log(`セッションを終了しました: ${sessionId}`);
    res.status(200).json({ message: 'Session terminated' });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// ヘルスチェック用エンドポイント
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    server: 'MCP Streamable HTTP File Operations Server',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    sessions: Object.keys(transports).length,
    mcpEndpoint: '/mcp',
    serverRoot: SERVER_ROOT,
    allowedExtensions: ALLOWED_EXTENSIONS
  });
});

// CORS対応
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, x-api-key, Mcp-Session-Id, Last-Event-ID');
  res.header('Access-Control-Expose-Headers', 'Content-Type, Authorization, x-api-key, Mcp-Session-Id');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`🚀 MCP Streamable HTTP サーバーがポート ${PORT} で起動しました`);
  console.log(`📁 サーバールート: ${SERVER_ROOT}`);
  console.log(`🔧 許可されたファイル拡張子: ${ALLOWED_EXTENSIONS.join(', ')}`);
  console.log(`🌐 MCP エンドポイント: http://localhost:${PORT}/mcp`);
  console.log(`❤️ ヘルスチェック: http://localhost:${PORT}/health`);
  console.log(`📋 Claude.ai 設定用URL: http://x162-43-29-7.compute.amazonaws.com:${PORT}/mcp`);
});