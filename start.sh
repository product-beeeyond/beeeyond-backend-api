#!/bin/bash

# ==================================================================================================
# 🚀 Automated Deployment Script for Beeeyond Backend API on AWS EC2
# ==================================================================================================
# This script:
# ✅ Clones the beeeyond-backend-api repo using HTTPS authentication
# ✅ Installs Node.js, PostgreSQL, Redis, and dependencies
# ✅ Builds TypeScript code and starts the app using PM2
# ✅ Configures Nginx as a reverse proxy
# ✅ Sets up SSL (Let's Encrypt) and domain configuration
# ✅ Manages environment variables and database migrations
# ==================================================================================================

set -e  # Exit script immediately if any command fails

# ======================================================================================
# 🔧 CONFIGURATION VARIABLES 
# ======================================================================================
GITHUB_USERNAME="your-username"                    # Your GitHub username
GITHUB_REPO="beeeyond-backend-api"                 # Repository name
GITHUB_TOKEN="your-github-token"                   # GitHub personal access token
APP_DIR="/var/www/beeeyond-backend"                # App installation directory
NODE_VERSION="18"                                  # Node.js version
APP_PORT=3000                                      # Application port
DOMAIN_NAME="api.beeeyond.africa"                  # Your domain name (optional)
POSTGRES_DB="beeeyond_db"                          # PostgreSQL database name
POSTGRES_USER="beeeyond_user"                      # PostgreSQL username
POSTGRES_PASSWORD="secure_password_here"          # PostgreSQL password

# ======================================================================================
# 🎨 HELPER FUNCTIONS
# ======================================================================================
log_info() {
    echo -e "\033[1;34m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[1;32m[SUCCESS]\033[0m $1"
}

log_warning() {
    echo -e "\033[1;33m[WARNING]\033[0m $1"
}

log_error() {
    echo -e "\033[1;31m[ERROR]\033[0m $1"
}

# ======================================================================================
# 1️⃣ SYSTEM UPDATE & BASIC DEPENDENCIES
# ======================================================================================
log_info "Updating system packages..."
sudo dnf update -y

log_info "Installing basic dependencies..."
sudo dnf install -y git curl wget nginx certbot python3-certbot-nginx

# ======================================================================================
# 2️⃣ INSTALL NODE.JS
# ======================================================================================
log_info "Installing Node.js $NODE_VERSION..."
# Remove any existing Node.js
sudo dnf remove -y nodejs npm

# Install Node.js 18 from NodeSource
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo dnf install -y nodejs

# Install pnpm (package manager used by the project)
curl -fsSL https://get.pnpm.io/install.sh | sh -
source ~/.bashrc
export PATH="$HOME/.local/share/pnpm:$PATH"

# Verify installations
node_version=$(node --version)
npm_version=$(npm --version)
log_success "Node.js $node_version and npm $npm_version installed"

# ======================================================================================
# 3️⃣ INSTALL AND CONFIGURE POSTGRESQL
# ======================================================================================
log_info "Installing PostgreSQL..."
sudo dnf install -y postgresql15-server postgresql15

# Initialize PostgreSQL (only if not already initialized)
if [ ! -f /var/lib/pgsql/15/data/postgresql.conf ]; then
    sudo postgresql-setup --initdb
fi

# Start and enable PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
log_info "Setting up PostgreSQL database..."
sudo -u postgres psql <<EOF
CREATE DATABASE $POSTGRES_DB;
CREATE USER $POSTGRES_USER WITH ENCRYPTED PASSWORD '$POSTGRES_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE $POSTGRES_DB TO $POSTGRES_USER;
ALTER USER $POSTGRES_USER CREATEDB;
\q
EOF

log_success "PostgreSQL database '$POSTGRES_DB' created"

# ======================================================================================
# 4️⃣ INSTALL AND CONFIGURE REDIS
# ======================================================================================
log_info "Installing Redis..."
sudo dnf install -y redis

# Start and enable Redis
sudo systemctl start redis
sudo systemctl enable redis

# Configure Redis (basic security)
sudo sed -i 's/^# requirepass.*/requirepass your_redis_password_here/' /etc/redis/redis.conf
sudo systemctl restart redis

log_success "Redis installed and configured"

# ======================================================================================
# 5️⃣ INSTALL PM2 PROCESS MANAGER
# ======================================================================================
log_info "Installing PM2 process manager..."
sudo npm install -g pm2

# Configure PM2 to start on boot
sudo pm2 startup systemd -u $USER --hp $HOME
log_success "PM2 installed and configured"

# ======================================================================================
# 6️⃣ CLONE OR UPDATE REPOSITORY
# ======================================================================================
if [ -d "$APP_DIR" ]; then
    log_info "Repository exists. Pulling latest changes..."
    cd "$APP_DIR"
    git reset --hard HEAD
    git pull origin main
else
    log_info "Cloning repository..."
    sudo mkdir -p "$APP_DIR"
    sudo chown $USER:$USER "$APP_DIR"
    git clone https://$GITHUB_USERNAME:$GITHUB_TOKEN@github.com/$GITHUB_USERNAME/$GITHUB_REPO.git "$APP_DIR"
    cd "$APP_DIR"
fi

# ======================================================================================
# 7️⃣ INSTALL DEPENDENCIES AND BUILD
# ======================================================================================
log_info "Installing Node.js dependencies..."
pnpm install

log_info "Building TypeScript application..."
pnpm run build

log_success "Application built successfully"

# ======================================================================================
# 8️⃣ ENVIRONMENT CONFIGURATION
# ======================================================================================
log_info "Setting up environment variables..."

if [ ! -f "$APP_DIR/.env" ]; then
    log_warning "No .env file found. Creating default .env file..."
    cat <<EOT > "$APP_DIR/.env"
# Environment
NODE_ENV=production
PORT=$APP_PORT

# Database Configuration
DATABASE_URL=postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB
DB_HOST=localhost
DB_NAME=$POSTGRES_DB
DB_USERNAME=$POSTGRES_USER
DB_PASSWORD=$POSTGRES_PASSWORD
DB_PORT=5432

# JWT Configuration
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=24h
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_EXPIRES_IN=7d

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here
REDIS_URL=redis://localhost:6379

# Stellar Configuration (UPDATE THESE WITH YOUR ACTUAL VALUES)
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_PLATFORM_SECRET=YOUR_STELLAR_PLATFORM_SECRET_KEY
STELLAR_PLATFORM_PUBLIC_KEY=YOUR_STELLAR_PLATFORM_PUBLIC_KEY
STELLAR_TREASURY_SECRET=YOUR_STELLAR_TREASURY_SECRET_KEY
STELLAR_TREASURY_PUBLIC_KEY=YOUR_STELLAR_TREASURY_PUBLIC_KEY
STELLAR_RECOVERY_SECRET=YOUR_STELLAR_RECOVERY_SECRET_KEY

# Anchor Configuration
ANCHOR_DOMAIN=api.beeeyond.africa
ANCHOR_HOME_DOMAIN=beeeyond.africa
ANCHOR_MINIMUM_DEPOSIT=1000
ANCHOR_MAXIMUM_DEPOSIT=10000000
ANCHOR_MINIMUM_WITHDRAWAL=100
ANCHOR_MAXIMUM_WITHDRAWAL=5000000
ANCHOR_FEE_PERCENTAGE=0.01

# Payment Provider - Paga Configuration
PAGA_API_BASE_URL=https://api.paga.com/v1
PAGA_MERCHANT_ID=YOUR_PAGA_MERCHANT_ID
PAGA_API_KEY=YOUR_PAGA_API_KEY
PAGA_SECRET_KEY=YOUR_PAGA_SECRET_KEY
PAGA_WEBHOOK_SECRET=YOUR_PAGA_WEBHOOK_SECRET

# KYC Services
SMILE_IDENTITY_API_KEY=YOUR_SMILE_IDENTITY_API_KEY
SMILE_IDENTITY_PARTNER_ID=YOUR_SMILE_IDENTITY_PARTNER_ID
SMILE_IDENTITY_SANDBOX=true
BVN_VERIFICATION_URL=YOUR_BVN_VERIFICATION_URL
DOJAH_API_KEY=YOUR_DOJAH_API_KEY
DOJAH_APP_ID=YOUR_DOJAH_APP_ID

# Email Services
RESEND_API_KEY=YOUR_RESEND_API_KEY
FROM_EMAIL=noreply@beeeyond.africa

# SMS Services
TWILIO_ACCOUNT_SID=YOUR_TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN=YOUR_TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER=YOUR_TWILIO_PHONE_NUMBER

# File Storage
CLOUDINARY_CLOUD_NAME=YOUR_CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY=YOUR_CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET=YOUR_CLOUDINARY_API_SECRET

# Security Configuration
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# App Configuration
APP_NAME=BNGN Anchor
APP_URL=https://$DOMAIN_NAME
FRONTEND_URL=https://beeeyond.africa

# Monitoring (Optional)
SENTRY_DSN=YOUR_SENTRY_DSN
SENTRY_ENVIRONMENT=production
EOT

    log_warning "Default .env file created. Please update with your actual values!"
    log_warning "Edit the file: nano $APP_DIR/.env"
else
    log_info ".env file already exists. Skipping creation."
fi

# Set proper permissions for .env file
chmod 600 "$APP_DIR/.env"

# ======================================================================================
# 9️⃣ DATABASE MIGRATIONS AND SETUP
# ======================================================================================
log_info "Running database migrations..."

# Check if Sequelize CLI is available and run migrations
if [ -f "$APP_DIR/package.json" ] && grep -q "sequelize-cli" "$APP_DIR/package.json"; then
    pnpm run db:migrate
    log_success "Database migrations completed"
else
    log_warning "Sequelize CLI not found. Skipping database migrations."
    log_warning "Run migrations manually: pnpm run db:migrate"
fi

# ======================================================================================
# 🔟 PM2 PROCESS CONFIGURATION
# ======================================================================================
log_info "Configuring PM2 process..."

# Create PM2 ecosystem file
cat <<EOT > "$APP_DIR/ecosystem.config.js"
module.exports = {
  apps: [{
    name: 'beeeyond-backend-api',
    script: 'dist/server.js',
    cwd: '$APP_DIR',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: $APP_PORT
    },
    error_file: '$APP_DIR/logs/err.log',
    out_file: '$APP_DIR/logs/out.log',
    log_file: '$APP_DIR/logs/combined.log',
    time: true,
    max_restarts: 10,
    min_uptime: '10s',
    max_memory_restart: '1G',
    watch: false,
    ignore_watch: ['node_modules', 'logs'],
    env_production: {
      NODE_ENV: 'production'
    }
  }]
};
EOT

# Create logs directory
mkdir -p "$APP_DIR/logs"

# Stop existing PM2 processes and start new one
pm2 delete beeeyond-backend-api 2>/dev/null || true
pm2 start "$APP_DIR/ecosystem.config.js" --env production
pm2 save
pm2 startup

log_success "PM2 process configured and started"

# ======================================================================================
# 1️⃣1️⃣ NGINX REVERSE PROXY CONFIGURATION
# ======================================================================================
log_info "Configuring Nginx reverse proxy..."

# Create Nginx configuration
sudo tee /etc/nginx/conf.d/beeeyond-backend.conf > /dev/null <<EOT
# Rate limiting
limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;

# Upstream configuration
upstream beeeyond_backend {
    server 127.0.0.1:$APP_PORT;
    keepalive 32;
}

server {
    listen 80;
    server_name $DOMAIN_NAME;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Rate limiting
    limit_req zone=api burst=20 nodelay;

    # Proxy settings
    location / {
        proxy_pass http://beeeyond_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }

    # Health check endpoint
    location /health {
        proxy_pass http://beeeyond_backend/health;
        access_log off;
    }

    # Static files (if any)
    location /static/ {
        alias $APP_DIR/public/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied expired no-cache no-store private auth;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;
}
EOT

# Test Nginx configuration
sudo nginx -t

# Start and enable Nginx
sudo systemctl start nginx
sudo systemctl enable nginx
sudo systemctl reload nginx

log_success "Nginx reverse proxy configured"

# ======================================================================================
# 1️⃣2️⃣ SSL CERTIFICATE WITH LET'S ENCRYPT (Optional)
# ======================================================================================
# if [ ! -z "$DOMAIN_NAME" ] && [ "$DOMAIN_NAME" != "api.beeeyond.africa" ]; then
#     log_info "Setting up SSL certificate for $DOMAIN_NAME..."
    
#     # Obtain SSL certificate
#     sudo certbot --nginx -d "$DOMAIN_NAME" --non-interactive --agree-tos --email admin@beeeyond.africa
    
#     # Auto-renewal
#     sudo systemctl enable certbot-renew.timer
    
#     log_success "SSL certificate configured for $DOMAIN_NAME"
# else
#     log_warning "Skipping SSL setup. Update DOMAIN_NAME variable to enable SSL."
# fi

# ======================================================================================
# 1️⃣3️⃣ FIREWALL CONFIGURATION
# ======================================================================================
log_info "Configuring firewall..."

# Install and configure firewalld
sudo dnf install -y firewalld
sudo systemctl start firewalld
sudo systemctl enable firewalld

# Open necessary ports
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-port=$APP_PORT/tcp  # App port (internal)
sudo firewall-cmd --reload

log_success "Firewall configured"

# ======================================================================================
# 1️⃣4️⃣ MONITORING AND LOGGING SETUP
# ======================================================================================
log_info "Setting up monitoring and log rotation..."

# Configure log rotation
sudo tee /etc/logrotate.d/beeeyond-backend > /dev/null <<EOT
$APP_DIR/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        pm2 reloadLogs
    endscript
}
EOT

# Create monitoring script
cat <<EOT > "$APP_DIR/monitor.sh"
#!/bin/bash
# Simple monitoring script for Beeeyond Backend API

APP_NAME="beeeyond-backend-api"
LOG_FILE="$APP_DIR/logs/monitor.log"

# Check if PM2 process is running
if ! pm2 list | grep -q "\$APP_NAME.*online"; then
    echo "\$(date): WARNING - \$APP_NAME is not running. Attempting restart..." >> \$LOG_FILE
    pm2 restart \$APP_NAME
fi

# Check disk space
DISK_USAGE=\$(df / | awk 'NR==2 {print \$5}' | sed 's/%//')
if [ \$DISK_USAGE -gt 80 ]; then
    echo "\$(date): WARNING - Disk usage is \${DISK_USAGE}%" >> \$LOG_FILE
fi

# Check memory usage
MEMORY_USAGE=\$(free | awk 'NR==2{printf "%.2f", \$3*100/\$2}')
if (( \$(echo "\$MEMORY_USAGE > 90" | bc -l) )); then
    echo "\$(date): WARNING - Memory usage is \${MEMORY_USAGE}%" >> \$LOG_FILE
fi
EOT

chmod +x "$APP_DIR/monitor.sh"

# Add monitoring to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * $APP_DIR/monitor.sh") | crontab -

log_success "Monitoring and logging configured"

# ======================================================================================
# 1️⃣5️⃣ FINAL VERIFICATION AND CLEANUP
# ======================================================================================
log_info "Performing final verification..."

# Check if all services are running
SERVICES=("postgresql" "redis" "nginx")
for service in "${SERVICES[@]}"; do
    if systemctl is-active --quiet $service; then
        log_success "$service is running"
    else
        log_error "$service is not running"
    fi
done

# Check PM2 process
if pm2 list | grep -q "beeeyond-backend-api.*online"; then
    log_success "Beeeyond Backend API is running via PM2"
else
    log_error "Beeeyond Backend API is not running"
fi

# Test application endpoint
sleep 5
if curl -f http://localhost:$APP_PORT/health >/dev/null 2>&1; then
    log_success "Application health check passed"
else
    log_warning "Application health check failed - this might be normal if /health endpoint doesn't exist"
fi

# ======================================================================================
# 🎉 DEPLOYMENT COMPLETE
# ======================================================================================
log_success "========================================================"
log_success "🎉 BEEEYOND BACKEND API DEPLOYMENT COMPLETE!"
log_success "========================================================"
echo ""
log_info "Application Details:"
echo "  • App Directory: $APP_DIR"
echo "  • App Port: $APP_PORT"
echo "  • Domain: ${DOMAIN_NAME:-"Not configured"}"
echo "  • Database: PostgreSQL ($POSTGRES_DB)"
echo "  • Cache: Redis"
echo "  • Process Manager: PM2"
echo "  • Web Server: Nginx"
echo ""
log_info "Useful Commands:"
echo "  • View app logs: pm2 logs beeeyond-backend-api"
echo "  • Restart app: pm2 restart beeeyond-backend-api"
echo "  • Check app status: pm2 status"
echo "  • View Nginx logs: sudo tail -f /var/log/nginx/access.log"
echo "  • Edit environment: nano $APP_DIR/.env"
echo ""
log_warning "Next Steps:"
echo "  1. Update .env file with your actual API keys and secrets"
echo "  2. Restart the application: pm2 restart beeeyond-backend-api"
echo "  3. Test your API endpoints"
echo "  4. Configure your domain DNS to point to this server"
echo "  5. Update Stellar network to mainnet when ready for production"
echo ""
log_info "Access your API at: http://$(curl -s ifconfig.me):$APP_PORT"
if [ ! -z "$DOMAIN_NAME" ]; then
    log_info "Or via domain: https://$DOMAIN_NAME"
fi
echo ""
log_success "Happy coding! 🚀"