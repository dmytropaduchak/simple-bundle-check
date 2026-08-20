# simple-bundle-check

Measures JS/CSS assets under `dist`/`build`/`out` and warns when total size exceeds a KiB budget.

## Usage

```yaml
- uses: actions/checkout@v4
- run: npm run build
- uses: dmytropaduchak/simple-bundle-check@v0.1.0
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    budget-kb: "512"
```

## Develop

```bash
npm install && npm run build
```
