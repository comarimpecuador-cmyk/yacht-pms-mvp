# Deploy VPS `yacht.reinotierra.com` (same domain + `/api`)

## 1) Build and run containers

```bash
cd /opt/pms-yacht-platform
docker compose up -d --build
docker compose ps
docker compose logs -f --tail 200
```

## 2) Nginx host config (same domain)

Create `/etc/nginx/sites-available/yacht.reinotierra.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name yacht.reinotierra.com;

    client_max_body_size 25m;

    location /api/ {
        proxy_pass http://127.0.0.1:3011;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/yacht.reinotierra.com /etc/nginx/sites-enabled/yacht.reinotierra.com
sudo nginx -t
sudo systemctl reload nginx
```

If you already have HTTPS certificates configured, keep that TLS block and only update the `location` proxy targets.

## 3) Health checks

```bash
# Direct loopback checks (containers)
curl -i http://127.0.0.1:3010/api/health
curl -i http://127.0.0.1:3011/api/health

# Public domain checks (through Nginx)
curl -ik https://yacht.reinotierra.com/api/health

# Login endpoint smoke test
curl -ik -X POST https://yacht.reinotierra.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"captain@yachtpms.com","password":"captain123"}'
```

## 4) QA checklist

- Web loads on `https://yacht.reinotierra.com` with HTTP `200`.
- API health responds on `https://yacht.reinotierra.com/api/health` with HTTP `200`.
- Login `POST /api/auth/login` returns HTTP `200` and sets `Set-Cookie` for `accessToken` and `refreshToken`.
- Cookies are `HttpOnly`; with production env they are also `Secure`.
- Refresh endpoint `POST /api/auth/refresh` returns `200` when refresh cookie exists, `401` when missing/invalid.
- Protected endpoint (example `/api/auth/me`) returns `200` with valid cookies and `401` without session.
- Upload flow works and files remain after container restart (volume `pms-api-uploads`).
- No DB port is exposed on host (`docker compose ps` should not show `5432` published).
