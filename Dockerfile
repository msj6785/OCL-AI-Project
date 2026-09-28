FROM docker.io/library/nginx:latest

COPY index.html /usr/share/nginx/html/index.html
COPY style.css /usr/share/nginx/html/style.css
COPY script.js /usr/share/nginx/html/script.js
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
