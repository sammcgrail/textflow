FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY static/ /usr/share/nginx/html/static/
EXPOSE 8080
