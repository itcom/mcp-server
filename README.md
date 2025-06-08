# MCP File Operations Server

A powerful Model Context Protocol (MCP) server built with Express.js that provides seamless file operations for AI assistants like Claude Desktop and Web Claude.

## 🚀 Features

- **Automatic Operation Mode Detection**: Auto-selects stdio/HTTP mode based on environment
- **Multiple Project Support**: Tool namespace isolation with PROJECT_ID
- **File Operations**: Comprehensive file system access with security controls
- **Laravel Project Support**: Built-in Laravel project structure analysis
- **Real-time Updates**: SSE (Server-Sent Events) for real-time communication
- **OAuth Integration**: Complete OAuth 2.0 flow for Web Claude connections

## 📋 Requirements

- **Node.js**: v18.0.0 or higher (tested with v22.15.0)
- **npm**: Latest version
- **TypeScript**: v5.5.0 or higher

## ⚙️ Configuration Methods

This server supports **2 configuration methods**:

### 1. Environment Variables

```bash
# Direct environment variable specification
SERVER_ROOT=/path/to/project PROJECT_ID=myproject PORT=3001 node dist/index.js

# systemd service configuration example
Environment=SERVER_ROOT=/var/www/project
Environment=PROJECT_ID=production
Environment=PORT=3001
```

### 2. .env File Configuration

Create a `.env` file in the project root:

```bash
# MCP Server Configuration

# Operation mode (auto, stdio, http)
MCP_MODE=auto

# Project settings
PROJECT_ID=myproject
SERVER_ROOT=/var/www/project

# HTTP mode settings
PORT=3001
BASE_URL=https://mcp.your-domain.com
ENDPOINT_PATH=/sse

# Security settings
ALLOWED_EXTENSIONS=.php,.js,.ts,.json,.md,.txt,.yaml,.yml,.blade.php,.service,.conf,.sh,.xml

# Node.js environment
NODE_ENV=production
```

### Configuration Priority

1. **Environment Variables** (highest priority)
2. **Claude Desktop config env settings**
3. **.env file**
4. **Default values**

### Claude Desktop Configuration Example

```json
{
  "mcpServers": {
    "my-project": {
      "command": "/path/to/node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "SERVER_ROOT": "/path/to/project",
        "MCP_MODE": "stdio",
        "PROJECT_ID": "myproject"
      }
    }
  }
}
```

In this case, Claude Desktop's `env` settings take highest priority, overriding `.env` file settings.

### Remote Server Configuration Examples

**systemd service** (environment variables):
```ini
Environment=NODE_ENV=production
Environment=SERVER_ROOT=/var/www/project
Environment=PORT=3001
Environment=PROJECT_ID=production
```

**Or .env file**:
```bash
NODE_ENV=production
SERVER_ROOT=/var/www/project
PORT=3001
PROJECT_ID=production
```

## 🏗️ Operation Modes

### Automatic Mode Detection Logic

```typescript
const MODE = process.env.MCP_MODE || 'auto';
const isHttpArgs = process.argv.includes('--http');
const hasPortEnv = process.env.PORT;
const isStdioMode = MODE === 'stdio' || (MODE === 'auto' && !hasPortEnv && !isHttpArgs);
```

| Condition | Operation Mode | Use Case |
|-----------|----------------|----------|
| `MCP_MODE=stdio` | **stdio** | Desktop Claude (local development) |
| `MCP_MODE=http` | **HTTP** | Remote server (production) |
| `MCP_MODE=auto` + no `PORT` | **stdio** | Desktop Claude (auto-detection) |
| `MCP_MODE=auto` + `PORT` exists | **HTTP** | Remote server (auto-detection) |
| `--http` flag | **HTTP** | Command line specification |

### stdio Mode (Local Development - Recommended)

**Features**:
- Best performance
- No network overhead
- Desktop Claude exclusive
- Direct process communication
- Claude Desktop automatically starts and manages processes

**Test Method** (for verification):
```bash
# Build verification
npm run build

# Operation test (exit immediately with Ctrl+C)
node dist/index.js
# Expected output: "Desktop Claude MCP Server started"
```

### HTTP Mode (Remote Server)

**Features**:
- Web Claude compatible
- Remote access capable
- OAuth authentication support
- SSL support via Nginx

**Startup Methods**:
```bash
# Environment variable specification
PORT=3001 node dist/index.js

# Explicit specification
MCP_MODE=http PORT=3001 node dist/index.js
```

## 🛠️ Installation

### Local Development (stdio mode)

```bash
# Clone repository
git clone <your-repo-url>
cd mcp-server

# Install dependencies
npm install

# Build project
npm run build

# Test stdio mode
node dist/index.js
# Output: "Desktop Claude MCP Server started"
```

### Remote Server (HTTP mode)

```bash
# Install dependencies
npm install

# Build project
npm run build

# Start in HTTP mode
PORT=3001 npm start
# Output: "HTTPサーバー起動完了 (Port: 3001)"
```

## 🎯 Usage

### With Claude Desktop (stdio mode)

Add to Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "local-project-files": {
      "command": "/Users/[USERNAME]/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/bin/node",
      "args": [
        "/path/to/mcp-server/dist/index.js"
      ],
      "env": {
        "SERVER_ROOT": "/path/to/your/project",
        "MCP_MODE": "stdio",
        "PROJECT_ID": "myproject"
      }
    },
    "mcp-server-files": {
      "command": "/Users/[USERNAME]/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/bin/node",
      "args": [
        "/path/to/mcp-server/dist/index.js"
      ],
      "env": {
        "SERVER_ROOT": "/path/to/mcp-server",
        "MCP_MODE": "stdio",
        "PROJECT_ID": "mcp"
      }
    }
  }
}
```

### With Claude Desktop (Remote HTTP mode)

```json
{
  "mcpServers": {
    "remote-server-files": {
      "command": "/Users/[USERNAME]/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/bin/npx",
      "args": [
        "mcp-remote",
        "https://your-server.com/sse"
      ],
      "env": {
        "PATH": "/Users/[USERNAME]/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/bin:/usr/local/bin:/usr/bin:/bin",
        "NODE_PATH": "/Users/[USERNAME]/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/lib/node_modules"
      }
    }
  }
}
```

### Important Notes for Multiple Project Management

**PROJECT_ID is required**:
- Set different `PROJECT_ID` for each project
- Prevents tool name conflicts (e.g., `projecta_list_files`, `projectb_list_files`)
- Auto-generated from directory name if not set

### Finding Your Node.js Path

```bash
# Find Node.js installation path
which node

# If using nvm (Node Version Manager)
nvm which current

# Example outputs:
# /Users/username/Library/Application Support/Herd/config/nvm/versions/node/v22.15.0/bin/node
# /usr/local/bin/node
# /opt/homebrew/bin/node
```

## 🚀 Production Remote Server Setup

### systemd Service Configuration

`/etc/systemd/system/mcp-server.service`:

```ini
[Unit]
Description=MCP File Operations Server
Documentation=https://github.com/itcomllc/mcp-server
After=network.target
Wants=network.target

[Service]
Type=simple
User=web
Group=web
WorkingDirectory=/var/www/project/mcp-server
Environment=NODE_ENV=production
Environment=SERVER_ROOT=/var/www/project
Environment=PORT=3001
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mcp-server

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=false
ReadWritePaths=/var/www/project/mcp-server
ReadOnlyPaths=/var/www/project

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
```

### Nginx Configuration

`/etc/nginx/sites-available/mcp-server`:

```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name mcp.your-domain.com;

    root /var/www/project/mcp-server;

    # SSL configuration
    ssl_certificate     /etc/letsencrypt/live/mcp.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.your-domain.com/privkey.pem;

    # SSL optimization
    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers 'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:!DSS:!3DES:!RC4:!aNULL:!eNULL:!MD5:!SHA1:!EXP:!PSK:!SRP';
    ssl_ecdh_curve prime256v1;
    ssl_prefer_server_ciphers on;

    # MCP SSE endpoint
    location /sse {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE specific settings
        proxy_cache off;
        proxy_buffering off;
        chunked_transfer_encoding off;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # OAuth endpoints
    location ~ ^/(\.well-known/oauth-authorization-server|authorize|token|register) {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Short timeout for health checks
        proxy_read_timeout 10s;
        proxy_send_timeout 10s;
        proxy_connect_timeout 5s;
    }

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
}
```

### Deployment Steps

```bash
# 1. Prepare code on server
git clone <your-repo-url> /var/www/project/mcp-server
cd /var/www/project/mcp-server
npm install
npm run build

# 2. Enable systemd service
sudo systemctl enable mcp-server
sudo systemctl start mcp-server
sudo systemctl status mcp-server

# 3. Enable Nginx configuration
sudo ln -s /etc/nginx/sites-available/mcp-server /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 4. Obtain SSL certificate (Let's Encrypt)
sudo certbot --nginx -d mcp.your-domain.com

# 5. Verify operation
curl https://mcp.your-domain.com/health
```

## 🔧 Available Tools

All tools are automatically prefixed with your `PROJECT_ID`:

### `[PROJECT_ID]_list_files`
List files and directories with filtering options.

```json
{
  "directory": ".",
  "recursive": false,
  "include_hidden": false,
  "exclude_dirs": ["vendor", "node_modules", "storage", ".git"]
}
```

### `[PROJECT_ID]_read_file`
Read file contents with encoding support.

```json
{
  "file_path": "path/to/file.txt",
  "encoding": "utf8"
}
```

### `[PROJECT_ID]_get_laravel_structure`
Analyze Laravel project structure and get statistics.

```json
{
  "project_root": ".",
  "include_config": true
}
```

### `[PROJECT_ID]_search_files`
Search files with pattern matching and content search.

```json
{
  "directory": ".",
  "pattern": "Controller",
  "content_search": "function",
  "file_extension": ".php"
}
```

### `[PROJECT_ID]_get_server_info`
Get server status and configuration information.

```json
{}
```

## ⚙️ Environment Variables

| Variable | Description | Default | stdio | HTTP |
|----------|-------------|---------|-------|------|
| `MCP_MODE` | Operation mode: auto/stdio/http | `auto` | ✅ | ✅ |
| `PROJECT_ID` | Tool namespace identifier | auto-generated | ✅ | ✅ |
| `SERVER_ROOT` | Root directory for file operations | `process.cwd()` | ✅ | ✅ |
| `PORT` | HTTP server port | none | ❌ | ✅ |
| `BASE_URL` | Base URL for HTTP mode | `http://localhost:3001` | ❌ | ✅ |
| `ENDPOINT_PATH` | MCP endpoint path | `/sse` | ❌ | ✅ |

## 🐛 Troubleshooting

### Operation Mode Verification

```bash
# stdio mode verification
node dist/index.js
# Output: "Desktop Claude MCP Server started"

# HTTP mode verification
PORT=3001 node dist/index.js
# Output: "HTTPサーバー起動完了 (Port: 3001)"
```

### Common Issues

**Node.js path not found**:
```bash
which node
nvm which current
```

**PROJECT_ID conflicts**:
- Set different PROJECT_ID for each project
- Same PROJECT_ID causes tool name conflicts

**systemd service won't start**:
```bash
sudo systemctl status mcp-server
sudo journalctl -u mcp-server -f
```

**Nginx configuration errors**:
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

## 📚 Configuration Templates

### claude-desktop-config.json (Complete)

```json
{
  "mcpServers": {
    "local-project-a": {
      "command": "/path/to/node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "SERVER_ROOT": "/path/to/project-a",
        "MCP_MODE": "stdio",
        "PROJECT_ID": "projecta"
      }
    },
    "local-project-b": {
      "command": "/path/to/node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "SERVER_ROOT": "/path/to/project-b",
        "MCP_MODE": "stdio",
        "PROJECT_ID": "projectb"
      }
    },
    "remote-production": {
      "command": "/path/to/npx",
      "args": ["mcp-remote", "https://mcp.your-domain.com/sse"],
      "env": {
        "PATH": "/path/to/node/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

## 💡 Best Practices

1. **Use stdio mode for local development** - Best performance
2. **Use HTTP mode for production** - Nginx + systemd + SSL
3. **Namespace separation with PROJECT_ID** - Prevent tool name conflicts
4. **Mode control with environment variables** - Explicit specification with `MCP_MODE`
5. **Security settings** - systemd restrictions and Nginx headers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Anthropic](https://anthropic.com) for the Model Context Protocol specification
- [Cloudflare](https://developers.cloudflare.com/agents/) for MCP implementation guidance
- The MCP community for protocol development and best practices

---

**Seamless MCP experience from local development to remote production!**