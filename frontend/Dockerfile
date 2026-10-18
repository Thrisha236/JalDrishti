# JalRakshak web app: build with Node, serve with nginx (which also forwards /api to the API container).
#   docker build -f frontend/Dockerfile -t jalrakshak-web .   (from the REPOSITORY ROOT: the app imports seed/ and shared/)
FROM node:20-alpine AS build
WORKDIR /srv
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend ./frontend
COPY seed ./seed
COPY shared ./shared
RUN cd frontend && npm run build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /srv/frontend/dist /usr/share/nginx/html
EXPOSE 80
