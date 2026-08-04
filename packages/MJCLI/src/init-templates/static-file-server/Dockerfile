# Mode D demo: bake a static HTML payload into nginx:alpine so the test-runner
# can drive a tiny app that lives inside the regression compose network.
#
# This image is intentionally trivial — the whole point of the example is to
# show the *overlay pattern*, not to teach app deployment. For a more realistic
# Angular + Express + planted-bugs example, see ../bring-your-own-app/.
FROM nginx:alpine

# Tiny default config: serve /public on :3000, no caching so test re-runs
# always see the latest HTML if the volume is bind-mounted.
RUN printf '%s\n' \
    'server {' \
    '    listen 3000;' \
    '    root /public;' \
    '    index index.html;' \
    '    add_header Cache-Control "no-store";' \
    '    location / { try_files $uri $uri/ =404; }' \
    '}' \
    > /etc/nginx/conf.d/default.conf

COPY public/ /public/

EXPOSE 3000
