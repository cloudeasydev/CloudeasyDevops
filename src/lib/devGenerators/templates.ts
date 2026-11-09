export type GeneratorCategory = "dockerfile" | "ignore" | "compose" | "scripts" | "cicd" | "commands";

export type GeneratorField = {
  key: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
};

export type GeneratorTemplate = {
  id: string;
  category: GeneratorCategory;
  title: string;
  description: string;
  filename: string;
  fields: GeneratorField[];
  generate: (v: Record<string, string>) => string;
  /** When set, overrides `generate` and produces multiple manifest files. */
  generateFiles?: (v: Record<string, string>) => { name: string; content: string }[];
};

const v = (values: Record<string, string>, key: string, fallback: string) =>
  values[key]?.trim() || fallback;

export const GENERATOR_CATEGORIES: { id: GeneratorCategory; label: string; hint: string }[] = [
  { id: "dockerfile", label: "Dockerfile", hint: "Production-ready container builds" },
  { id: "ignore", label: "Ignore files", hint: ".gitignore, .dockerignore, .npmignore" },
  { id: "compose", label: "Docker Compose", hint: "Local stacks with DB, cache, proxy" },
  { id: "scripts", label: "Shell scripts", hint: "Deploy, backup, health checks" },
  { id: "cicd", label: "Pipelines", hint: "GitHub Actions, Cloud Build, Jenkins, Azure, AWS & more" },
  { id: "commands", label: "Command cheatsheets", hint: "Docker, K8s, Git, Linux, npm" },
];

export const GENERATOR_TEMPLATES: GeneratorTemplate[] = [
  {
    id: "docker-node-express",
    category: "dockerfile",
    title: "Node.js (Express / API)",
    description: "Multi-stage build with non-root user.",
    filename: "Dockerfile",
    fields: [
      { key: "nodeVersion", label: "Node version", defaultValue: "20" },
      { key: "port", label: "Expose port", defaultValue: "3000" },
      { key: "startCmd", label: "Start command", defaultValue: "node dist/index.js" },
    ],
    generate: (values) => {
      const node = v(values, "nodeVersion", "20");
      const port = v(values, "port", "3000");
      const start = v(values, "startCmd", "node dist/index.js");
      return `# syntax=docker/dockerfile:1
FROM node:${node}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:${node}-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:${node}-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
USER app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
EXPOSE ${port}
CMD ${JSON.stringify(start.split(" "))}
`;
    },
  },
  {
    id: "docker-python-fastapi",
    category: "dockerfile",
    title: "Python (FastAPI / Uvicorn)",
    description: "Slim image with uvicorn.",
    filename: "Dockerfile",
    fields: [
      { key: "pythonVersion", label: "Python version", defaultValue: "3.12" },
      { key: "port", label: "Port", defaultValue: "8000" },
      { key: "module", label: "App module", defaultValue: "app.main:app" },
    ],
    generate: (values) => {
      const py = v(values, "pythonVersion", "3.12");
      const port = v(values, "port", "8000");
      const mod = v(values, "module", "app.main:app");
      return `FROM python:${py}-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser
EXPOSE ${port}
CMD ["uvicorn", "${mod}", "--host", "0.0.0.0", "--port", "${port}"]
`;
    },
  },
  {
    id: "docker-go",
    category: "dockerfile",
    title: "Go (static binary)",
    description: "Tiny distroless-style scratch build.",
    filename: "Dockerfile",
    fields: [
      { key: "goVersion", label: "Go version", defaultValue: "1.22" },
      { key: "mainPkg", label: "Main package path", defaultValue: "./cmd/api" },
      { key: "port", label: "Port", defaultValue: "8080" },
    ],
    generate: (values) => {
      const go = v(values, "goVersion", "1.22");
      const pkg = v(values, "mainPkg", "./cmd/api");
      const port = v(values, "port", "8080");
      return `FROM golang:${go}-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/app ${pkg}

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /out/app .
EXPOSE ${port}
USER nobody
ENTRYPOINT ["./app"]
`;
    },
  },
  {
    id: "docker-nginx-static",
    category: "dockerfile",
    title: "Static site (Vite/React → Nginx)",
    description: "Build frontend and serve with nginx.",
    filename: "Dockerfile",
    fields: [
      { key: "nodeVersion", label: "Node version", defaultValue: "20" },
      { key: "buildCmd", label: "Build command", defaultValue: "npm run build" },
      { key: "distDir", label: "Output folder", defaultValue: "dist" },
    ],
    generate: (values) => {
      const node = v(values, "nodeVersion", "20");
      const buildCmd = v(values, "buildCmd", "npm run build");
      const dist = v(values, "distDir", "dist");
      return `FROM node:${node}-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN ${buildCmd}

FROM nginx:1.27-alpine
COPY --from=build /app/${dist} /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`;
    },
  },
  {
    id: "gitignore-node",
    category: "ignore",
    title: ".gitignore — Node / TypeScript",
    description: "Common JS/TS project ignores.",
    filename: ".gitignore",
    fields: [],
    generate: () => `# Dependencies
node_modules/
.pnp
.pnp.js

# Build
dist/
build/
.next/
out/
*.tsbuildinfo

# Env & secrets
.env
.env.*
!.env.example

# Logs & cache
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*
.cache/
.turbo/

# IDE & OS
.idea/
.vscode/*
!.vscode/extensions.json
.DS_Store
Thumbs.db

# Test / coverage
coverage/
.nyc_output/
`,
  },
  {
    id: "gitignore-python",
    category: "ignore",
    title: ".gitignore — Python",
    description: "venv, caches, pytest.",
    filename: ".gitignore",
    fields: [],
    generate: () => `__pycache__/
*.py[cod]
*.egg-info/
.eggs/
dist/
build/
.venv/
venv/
.env
.pytest_cache/
.mypy_cache/
.ruff_cache/
htmlcov/
.coverage
.idea/
.vscode/
`,
  },
  {
    id: "gitignore-terraform",
    category: "ignore",
    title: ".gitignore — Terraform",
    description: "State backups and provider cache.",
    filename: ".gitignore",
    fields: [],
    generate: () => `.terraform/
*.tfstate
*.tfstate.*
crash.log
crash.*.log
override.tf
override.tf.json
*_override.tf
*_override.tf.json
.terraformrc
terraform.rc
*.tfvars
!*.tfvars.example
`,
  },
  {
    id: "dockerignore-node",
    category: "ignore",
    title: ".dockerignore — Node",
    description: "Smaller Docker build context.",
    filename: ".dockerignore",
    fields: [],
    generate: () => `node_modules
npm-debug.log
.git
.gitignore
.env
.env.*
Dockerfile*
docker-compose*
README.md
coverage
dist
.vscode
.idea
`,
  },
  {
    id: "compose-node-postgres",
    category: "compose",
    title: "App + PostgreSQL",
    description: "API service with Postgres volume.",
    filename: "docker-compose.yml",
    fields: [
      { key: "appName", label: "Service name", defaultValue: "api" },
      { key: "appPort", label: "Host port", defaultValue: "3000" },
      { key: "dbName", label: "Database name", defaultValue: "app" },
      { key: "dbUser", label: "DB user", defaultValue: "app" },
      { key: "dbPassword", label: "DB password", defaultValue: "changeme" },
    ],
    generate: (values) => {
      const app = v(values, "appName", "api");
      const port = v(values, "appPort", "3000");
      const db = v(values, "dbName", "app");
      const user = v(values, "dbUser", "app");
      const pass = v(values, "dbPassword", "changeme");
      return `services:
  ${app}:
    build: .
    ports:
      - "${port}:${port}"
    environment:
      DATABASE_URL: postgres://${user}:${pass}@db:5432/${db}
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${user}
      POSTGRES_PASSWORD: ${pass}
      POSTGRES_DB: ${db}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${user} -d ${db}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
`;
    },
  },
  {
    id: "compose-redis",
    category: "compose",
    title: "App + Redis",
    description: "Cache/session store alongside app.",
    filename: "docker-compose.yml",
    fields: [
      { key: "appPort", label: "App port", defaultValue: "3000" },
    ],
    generate: (values) => {
      const port = v(values, "appPort", "3000");
      return `services:
  app:
    build: .
    ports:
      - "${port}:${port}"
    environment:
      REDIS_URL: redis://redis:6379

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redisdata:/data

volumes:
  redisdata:
`;
    },
  },
  {
    id: "script-deploy-docker",
    category: "scripts",
    title: "Bash — Build & run container",
    description: "Build image, stop old container, run new.",
    filename: "deploy.sh",
    fields: [
      { key: "imageName", label: "Image name", defaultValue: "myapp" },
      { key: "tag", label: "Tag", defaultValue: "latest" },
      { key: "port", label: "Host:container port", defaultValue: "3000:3000" },
    ],
    generate: (values) => {
      const name = v(values, "imageName", "myapp");
      const tag = v(values, "tag", "latest");
      const ports = v(values, "port", "3000:3000");
      return `#!/usr/bin/env bash
set -euo pipefail

IMAGE="${name}:${tag}"
CONTAINER="${name}"

echo "Building \${IMAGE}..."
docker build -t "\${IMAGE}" .

docker stop "\${CONTAINER}" 2>/dev/null || true
docker rm "\${CONTAINER}" 2>/dev/null || true

echo "Starting \${CONTAINER}..."
docker run -d --name "\${CONTAINER}" -p ${ports} --restart unless-stopped "\${IMAGE}"

docker ps --filter "name=\${CONTAINER}"
`;
    },
  },
  {
    id: "script-backup-postgres",
    category: "scripts",
    title: "Bash — PostgreSQL backup",
    description: "pg_dump with timestamped file.",
    filename: "backup-postgres.sh",
    fields: [
      { key: "container", label: "Postgres container name", defaultValue: "db" },
      { key: "dbUser", label: "DB user", defaultValue: "app" },
      { key: "dbName", label: "Database", defaultValue: "app" },
    ],
    generate: (values) => {
      const c = v(values, "container", "db");
      const user = v(values, "dbUser", "app");
      const db = v(values, "dbName", "app");
      return `#!/usr/bin/env bash
set -euo pipefail

CONTAINER="${c}"
DB_USER="${user}"
DB_NAME="${db}"
OUT="backup_\${DB_NAME}_$(date +%Y%m%d_%H%M%S).sql.gz"

docker exec "\${CONTAINER}" pg_dump -U "\${DB_USER}" "\${DB_NAME}" | gzip > "\${OUT}"
echo "Saved \${OUT}"
`;
    },
  },
  {
    id: "script-health-check",
    category: "scripts",
    title: "Bash — HTTP health check",
    description: "Retry loop for readiness.",
    filename: "health-check.sh",
    fields: [
      { key: "url", label: "Health URL", defaultValue: "http://localhost:3000/api/health" },
      { key: "maxAttempts", label: "Max attempts", defaultValue: "30" },
    ],
    generate: (values) => {
      const url = v(values, "url", "http://localhost:3000/api/health");
      const max = v(values, "maxAttempts", "30");
      return `#!/usr/bin/env bash
set -euo pipefail

URL="${url}"
MAX=${max}
i=1

while [ $i -le $MAX ]; do
  if curl -sf "$URL" >/dev/null; then
    echo "OK: $URL"
    exit 0
  fi
  echo "Waiting ($i/$MAX)..."
  sleep 2
  i=$((i + 1))
done

echo "Health check failed: $URL"
exit 1
`;
    },
  },
  {
    id: "script-docker-cleanup",
    category: "scripts",
    title: "Bash — Docker cleanup",
    description: "Prune unused images, containers, volumes.",
    filename: "docker-cleanup.sh",
    fields: [],
    generate: () => `#!/usr/bin/env bash
set -euo pipefail

echo "Stopping exited containers..."
docker container prune -f

echo "Removing dangling images..."
docker image prune -f

echo "Optional: remove unused volumes (uncomment if needed)"
# docker volume prune -f

docker system df
`,
  },
  {
    id: "cicd-github-node",
    category: "cicd",
    title: "GitHub Actions — Node CI",
    description: "Install, lint, test, build on push/PR.",
    filename: "node-ci.yml",
    fields: [
      { key: "nodeVersion", label: "Node version", defaultValue: "20" },
      { key: "workingDir", label: "Working directory", defaultValue: "." },
    ],
    generate: (values) => {
      const node = v(values, "nodeVersion", "20");
      const dir = v(values, "workingDir", ".");
      const prefix = dir === "." ? "" : `    defaults:\n      run:\n        working-directory: ${dir}\n\n`;
      return `name: Node CI

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
${prefix}    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${node}
          cache: npm
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm test --if-present
      - run: npm run build --if-present
`;
    },
  },
  {
    id: "cicd-github-docker",
    category: "cicd",
    title: "GitHub Actions — Docker push",
    description: "Build and push to GHCR on main.",
    filename: "docker-publish.yml",
    fields: [
      { key: "imageName", label: "Image name (GHCR)", defaultValue: "ghcr.io/org/app" },
    ],
    generate: (values) => {
      const image = v(values, "imageName", "ghcr.io/org/app");
      return `name: Docker publish

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ${image}:\${{ github.sha }},${image}:latest
`;
    },
  },
  {
    id: "cicd-gitlab-docker",
    category: "cicd",
    title: "GitLab CI — Docker build",
    description: "Build image with Docker-in-Docker.",
    filename: ".gitlab-ci.yml",
    fields: [
      { key: "imageName", label: "Image tag prefix", defaultValue: "$CI_REGISTRY_IMAGE" },
    ],
    generate: (values) => {
      const img = v(values, "imageName", "$CI_REGISTRY_IMAGE");
      return `stages:
  - build

variables:
  DOCKER_TLS_CERTDIR: "/certs"

build:
  stage: build
  image: docker:27
  services:
    - docker:27-dind
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t ${img}:$CI_COMMIT_SHA -t ${img}:latest .
    - docker push ${img}:$CI_COMMIT_SHA
    - docker push ${img}:latest
  only:
    - main
`;
    },
  },
  {
    id: "pipeline-github-k8s",
    category: "cicd",
    title: "GitHub Actions — Deploy to Kubernetes",
    description: "Build image, push to registry, kubectl apply.",
    filename: "deploy-k8s.yml",
    fields: [
      { key: "imageName", label: "Container image", defaultValue: "ghcr.io/org/app" },
      { key: "k8sNamespace", label: "K8s namespace", defaultValue: "production" },
      { key: "manifestPath", label: "Manifest path", defaultValue: "k8s/" },
    ],
    generate: (values) => {
      const image = v(values, "imageName", "ghcr.io/org/app");
      const ns = v(values, "k8sNamespace", "production");
      const path = v(values, "manifestPath", "k8s/");
      return `name: Deploy to Kubernetes

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: \${{ github.actor }}
          password: \${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ${image}:\${{ github.sha }}
      - uses: azure/k8s-set-context@v4
        with:
          method: kubeconfig
          kubeconfig: \${{ secrets.KUBE_CONFIG }}
      - run: |
          kubectl set image deployment/app app=${image}:\${{ github.sha }} -n ${ns} --record
          kubectl rollout status deployment/app -n ${ns} --timeout=120s
      - run: kubectl apply -f ${path} -n ${ns}
`;
    },
  },
  {
    id: "pipeline-github-release",
    category: "cicd",
    title: "GitHub Actions — Tag release",
    description: "Build, test, and publish GitHub Release on tag push.",
    filename: "release.yml",
    fields: [
      { key: "nodeVersion", label: "Node version", defaultValue: "20" },
    ],
    generate: (values) => {
      const node = v(values, "nodeVersion", "20");
      return `name: Release

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${node}
          cache: npm
      - run: npm ci
      - run: npm test --if-present
      - run: npm run build --if-present
      - uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: |
            dist/**
`;
    },
  },
  {
    id: "pipeline-cloudbuild-docker",
    category: "cicd",
    title: "Google Cloud Build — Docker to GCR/AR",
    description: "Build and push image with cloudbuild.yaml.",
    filename: "cloudbuild.yaml",
    fields: [
      { key: "imageUri", label: "Image URI", defaultValue: "gcr.io/PROJECT_ID/app" },
      { key: "dockerfile", label: "Dockerfile path", defaultValue: "Dockerfile" },
    ],
    generate: (values) => {
      const img = v(values, "imageUri", "gcr.io/PROJECT_ID/app");
      const df = v(values, "dockerfile", "Dockerfile");
      return `steps:
  - name: gcr.io/cloud-builders/docker
    args:
      - build
      - -t
      - ${img}:$COMMIT_SHA
      - -t
      - ${img}:latest
      - -f
      - ${df}
      - .

  - name: gcr.io/cloud-builders/docker
    args:
      - push
      - ${img}:$COMMIT_SHA

  - name: gcr.io/cloud-builders/docker
    args:
      - push
      - ${img}:latest

images:
  - ${img}:$COMMIT_SHA
  - ${img}:latest

options:
  logging: CLOUD_LOGGING_ONLY
`;
    },
  },
  {
    id: "pipeline-cloudbuild-node",
    category: "cicd",
    title: "Google Cloud Build — Node test & build",
    description: "Install, test, build without Docker.",
    filename: "cloudbuild.yaml",
    fields: [
      { key: "nodeVersion", label: "Node version (build step)", defaultValue: "20" },
    ],
    generate: (values) => {
      const node = v(values, "nodeVersion", "20");
      return `steps:
  - name: node:${node}
    entrypoint: npm
    args: ["ci"]

  - name: node:${node}
    entrypoint: npm
    args: ["test", "--if-present"]

  - name: node:${node}
    entrypoint: npm
    args: ["run", "build", "--if-present"]

artifacts:
  objects:
    location: gs://\${_ARTIFACT_BUCKET}/builds/$BUILD_ID/
    paths:
      - dist/**

options:
  logging: CLOUD_LOGGING_ONLY
`;
    },
  },
  {
    id: "pipeline-jenkins-docker",
    category: "cicd",
    title: "Jenkins — Declarative Docker pipeline",
    description: "Checkout, build image, push to registry.",
    filename: "Jenkinsfile",
    fields: [
      { key: "imageName", label: "Docker image", defaultValue: "myregistry.io/team/app" },
      { key: "registryCred", label: "Registry credential ID", defaultValue: "docker-registry-creds" },
    ],
    generate: (values) => {
      const image = v(values, "imageName", "myregistry.io/team/app");
      const cred = v(values, "registryCred", "docker-registry-creds");
      return `pipeline {
  agent any

  environment {
    IMAGE = '${image}'
    TAG = "\${env.BUILD_NUMBER}-\${env.GIT_COMMIT.take(7)}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }
    stage('Build') {
      steps {
        sh 'docker build -t \${IMAGE}:\${TAG} -t \${IMAGE}:latest .'
      }
    }
    stage('Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: '${cred}', usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
          sh '''
            echo "$REG_PASS" | docker login \${IMAGE.split('/')[0]} -u "$REG_USER" --password-stdin
            docker push \${IMAGE}:\${TAG}
            docker push \${IMAGE}:latest
          '''
        }
      }
    }
  }

  post {
    always {
      sh 'docker logout || true'
    }
  }
}
`;
    },
  },
  {
    id: "pipeline-jenkins-node",
    category: "cicd",
    title: "Jenkins — Node CI (npm)",
    description: "Install, lint, test on any agent.",
    filename: "Jenkinsfile",
    fields: [
      { key: "nodeVersion", label: "Node version label", defaultValue: "20" },
    ],
    generate: (values) => {
      const node = v(values, "nodeVersion", "20");
      return `pipeline {
  agent {
    docker {
      image 'node:${node}-alpine'
      reuseNode true
    }
  }

  stages {
    stage('Install') {
      steps {
        sh 'npm ci'
      }
    }
    stage('Lint') {
      steps {
        sh 'npm run lint --if-present'
      }
    }
    stage('Test') {
      steps {
        sh 'npm test --if-present'
      }
    }
    stage('Build') {
      steps {
        sh 'npm run build --if-present'
      }
    }
  }
}
`;
    },
  },
  {
    id: "pipeline-azure-docker",
    category: "cicd",
    title: "Azure Pipelines — Docker build & push",
    description: "ACR login, build, push on main.",
    filename: "azure-pipelines.yml",
    fields: [
      { key: "acrName", label: "ACR name", defaultValue: "myregistry" },
      { key: "imageName", label: "Image repository", defaultValue: "app" },
    ],
    generate: (values) => {
      const acr = v(values, "acrName", "myregistry");
      const repo = v(values, "imageName", "app");
      return `trigger:
  branches:
    include:
      - main

pool:
  vmImage: ubuntu-latest

variables:
  acrLoginServer: ${acr}.azurecr.io
  imageRepository: ${repo}
  tag: $(Build.BuildId)

stages:
  - stage: Build
    jobs:
      - job: Docker
        steps:
          - task: Docker@2
            displayName: Build and push
            inputs:
              command: buildAndPush
              repository: $(imageRepository)
              dockerfile: Dockerfile
              containerRegistry: $(acrLoginServer)
              tags: |
                $(tag)
                latest
`;
    },
  },
  {
    id: "pipeline-circleci-node",
    category: "cicd",
    title: "CircleCI — Node workflow",
    description: "Install, test, build with caching.",
    filename: "config.yml",
    fields: [
      { key: "nodeVersion", label: "Node version", defaultValue: "20.11.0" },
    ],
    generate: (values) => {
      const node = v(values, "nodeVersion", "20.11.0");
      return `version: 2.1

orbs:
  node: circleci/node@5.2.0

jobs:
  build:
    executor:
      name: node/default
      tag: "${node}"
    steps:
      - checkout
      - node/install-packages:
          pkg-manager: npm
      - run:
          name: Lint
          command: npm run lint --if-present
      - run:
          name: Test
          command: npm test --if-present
      - run:
          name: Build
          command: npm run build --if-present

workflows:
  ci:
    jobs:
      - build
`;
    },
  },
  {
    id: "pipeline-bitbucket-node",
    category: "cicd",
    title: "Bitbucket Pipelines — Node",
    description: "Parallel steps optional; npm ci/test/build.",
    filename: "bitbucket-pipelines.yml",
    fields: [
      { key: "nodeVersion", label: "Node image tag", defaultValue: "20" },
    ],
    generate: (values) => {
      const node = v(values, "nodeVersion", "20");
      return `image: node:${node}

pipelines:
  default:
    - step:
        name: CI
        caches:
          - node
        script:
          - npm ci
          - npm run lint --if-present
          - npm test --if-present
          - npm run build --if-present
        artifacts:
          - dist/**

definitions:
  caches:
    node: node_modules
`;
    },
  },
  {
    id: "pipeline-aws-codebuild",
    category: "cicd",
    title: "AWS CodeBuild — buildspec.yml",
    description: "Install, test, docker build & push to ECR.",
    filename: "buildspec.yml",
    fields: [
      { key: "ecrRepo", label: "ECR repository URI", defaultValue: "123456789012.dkr.ecr.us-east-1.amazonaws.com/app" },
      { key: "awsRegion", label: "AWS region", defaultValue: "us-east-1" },
    ],
    generate: (values) => {
      const repo = v(values, "ecrRepo", "123456789012.dkr.ecr.us-east-1.amazonaws.com/app");
      const region = v(values, "awsRegion", "us-east-1");
      return `version: 0.2

phases:
  pre_build:
    commands:
      - echo Logging in to Amazon ECR...
      - aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${repo.split("/")[0]}
      - export IMAGE_TAG=\${CODEBUILD_RESOLVED_SOURCE_VERSION:-latest}
  build:
    commands:
      - echo Build started
      - docker build -t ${repo}:$IMAGE_TAG -t ${repo}:latest .
  post_build:
    commands:
      - docker push ${repo}:$IMAGE_TAG
      - docker push ${repo}:latest
      - printf '[{"name":"app","imageUri":"%s"}]' ${repo}:$IMAGE_TAG > imagedefinitions.json

artifacts:
  files:
    - imagedefinitions.json
`;
    },
  },
  {
    id: "pipeline-gitlab-k8s",
    category: "cicd",
    title: "GitLab CI — Build & deploy K8s",
    description: "Kaniko build, kubectl rollout.",
    filename: ".gitlab-ci.yml",
    fields: [
      { key: "imageName", label: "Image", defaultValue: "$CI_REGISTRY_IMAGE" },
      { key: "k8sNamespace", label: "Namespace", defaultValue: "staging" },
    ],
    generate: (values) => {
      const img = v(values, "imageName", "$CI_REGISTRY_IMAGE");
      const ns = v(values, "k8sNamespace", "staging");
      return `stages:
  - build
  - deploy

variables:
  IMAGE_TAG: $CI_COMMIT_SHORT_SHA

build:
  stage: build
  image:
    name: gcr.io/kaniko-project/executor:debug
    entrypoint: [""]
  script:
    - mkdir -p /kaniko/.docker
    - echo "{\\"auths\\":{\\"$CI_REGISTRY\\":{\\"auth\\":\\"$CI_REGISTRY_USER:$CI_REGISTRY_PASSWORD\\"}}}" > /kaniko/.docker/config.json
    - /kaniko/executor --context $CI_PROJECT_DIR --dockerfile $CI_PROJECT_DIR/Dockerfile --destination ${img}:$IMAGE_TAG
  only:
    - main

deploy:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl config use-context $KUBE_CONTEXT
    - kubectl set image deployment/app app=${img}:$IMAGE_TAG -n ${ns}
    - kubectl rollout status deployment/app -n ${ns}
  only:
    - main
`;
    },
  },
  {
    id: "pipeline-drone-docker",
    category: "cicd",
    title: "Drone CI — Docker pipeline",
    description: "Build and publish on push to main.",
    filename: ".drone.yml",
    fields: [
      { key: "imageName", label: "Image", defaultValue: "ghcr.io/org/app" },
    ],
    generate: (values) => {
      const image = v(values, "imageName", "ghcr.io/org/app");
      return `kind: pipeline
type: docker
name: default

trigger:
  branch:
    - main
  event:
    - push

steps:
  - name: test
    image: node:20-alpine
    commands:
      - npm ci
      - npm test --if-present

  - name: publish
    image: plugins/docker
    settings:
      repo: ${image}
      tags:
        - latest
        - \${DRONE_COMMIT_SHA:0:7}
      username:
        from_secret: docker_username
      password:
        from_secret: docker_password
`;
    },
  },
  {
    id: "commands-pipelines",
    category: "commands",
    title: "Pipeline CLI cheatsheet",
    description: "gh, gcloud builds, jenkins, az pipelines.",
    filename: "pipeline-commands.txt",
    fields: [],
    generate: () => `# CI/CD — common commands

# GitHub Actions
gh workflow list
gh run list --workflow=ci.yml
gh run watch
gh secret set MY_SECRET

# Google Cloud Build
gcloud builds submit --config cloudbuild.yaml .
gcloud builds log BUILD_ID

# Jenkins
java -jar jenkins-cli.jar -s http://jenkins/ help
curl -X POST http://jenkins/job/myjob/build --user user:token

# Azure DevOps
az pipelines run --name "my-pipeline"
az pipelines build list

# AWS CodeBuild
aws codebuild start-build --project-name my-project
aws codebuild batch-get-builds --ids id

# GitLab
gitlab-runner register
gitlab-runner run

# kubectl deploy (after pipeline)
kubectl rollout status deployment/app
`,
  },
  {
    id: "commands-docker",
    category: "commands",
    title: "Docker commands",
    description: "Daily Docker CLI reference.",
    filename: "docker-commands.txt",
    fields: [],
    generate: () => `# Docker — common commands

# Images
docker build -t myapp:latest .
docker images
docker rmi IMAGE_ID

# Containers
docker run -d --name api -p 3000:3000 myapp:latest
docker ps
docker ps -a
docker logs -f api
docker exec -it api sh
docker stop api && docker rm api

# Compose
docker compose up -d
docker compose down -v
docker compose logs -f

# Cleanup
docker system prune -a
docker volume ls
docker network ls

# Inspect
docker inspect api
docker stats
`,
  },
  {
    id: "commands-kubectl",
    category: "commands",
    title: "Kubernetes (kubectl)",
    description: "Pods, deploy, logs, port-forward.",
    filename: "kubectl-commands.txt",
    fields: [],
    generate: () => `# kubectl — quick reference

kubectl config current-context
kubectl get nodes
kubectl get pods -A
kubectl get svc,deploy,ingress -n NAMESPACE

kubectl describe pod POD -n NAMESPACE
kubectl logs -f POD -n NAMESPACE
kubectl exec -it POD -n NAMESPACE -- sh

kubectl apply -f manifest.yaml
kubectl rollout status deployment/NAME -n NAMESPACE
kubectl rollout undo deployment/NAME -n NAMESPACE

kubectl port-forward svc/NAME 8080:80 -n NAMESPACE
kubectl top pods -n NAMESPACE
`,
  },
  {
    id: "commands-git",
    category: "commands",
    title: "Git commands",
    description: "Branch, merge, stash, remote.",
    filename: "git-commands.txt",
    fields: [],
    generate: () => `# Git — common commands

git status
git pull --rebase origin main
git checkout -b feature/my-change
git add -p
git commit -m "feat: description"
git push -u origin feature/my-change

git log --oneline -10
git diff
git stash push -m "wip"
git stash pop

git remote -v
git fetch --all --prune
git merge origin/main
git rebase -i HEAD~3
`,
  },
  {
    id: "commands-linux",
    category: "commands",
    title: "Linux / DevOps",
    description: "Disk, process, network, permissions.",
    filename: "linux-devops-commands.txt",
    fields: [],
    generate: () => `# Linux — DevOps essentials

# Disk & memory
df -h
du -sh *
free -h

# Processes
ps aux | grep NAME
top / htop
kill -15 PID

# Network
ss -tlnp
curl -I https://example.com
dig +short example.com
nc -zv host 443

# Permissions & systemd
chmod 750 script.sh
chown user:group file
systemctl status nginx
journalctl -u nginx -f

# Archives
tar -czvf backup.tar.gz ./data
tar -xzvf backup.tar.gz
`,
  },
  {
    id: "commands-npm",
    category: "commands",
    title: "npm / pnpm / yarn",
    description: "Install, scripts, audit, clean.",
    filename: "node-package-commands.txt",
    fields: [],
    generate: () => `# Node package managers

npm ci
npm install PACKAGE
npm run build
npm test
npm audit fix

npx create-vite@latest
pnpm install
pnpm dlx turbo run build

yarn install --frozen-lockfile
yarn why PACKAGE

# Clean reinstall
rm -rf node_modules package-lock.json && npm install
`,
  },
];

export function templatesForCategory(category: GeneratorCategory) {
  return GENERATOR_TEMPLATES.filter((t) => t.category === category);
}

export function getTemplate(id: string) {
  return GENERATOR_TEMPLATES.find((t) => t.id === id);
}

export function defaultFieldValues(template: GeneratorTemplate) {
  return Object.fromEntries(template.fields.map((f) => [f.key, f.defaultValue]));
}
