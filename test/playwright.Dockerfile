# E2E browser image — official Playwright base (browsers + system deps preinstalled)
# RESEARCH.md:152, 318; pin rule: image tag MUST match @playwright/test@1.62.0 (A6).
# `npx playwright install` is NOT run (browsers already in the base image) and
# tests are NOT COPY'd — the compose volume ./tests:/test/tests delivers spec
# files live so 04-04's specs need no image rebuild.
FROM mcr.microsoft.com/playwright:v1.62.0-jammy
WORKDIR /test
COPY package.json package-lock.json ./
RUN npm ci
