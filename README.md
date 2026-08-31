# Slow Trading

see [README_SLOW.md](./docs/README_SLOW.md) for the detailed documentation of slow trading.

Try to debug memory consumtion

```bash
PORT=3010 \
HOSTNAME=0.0.0.0 \
NODE_ENV=production \
node --inspect=127.0.0.1:9230 --max-old-space-size=192 .next/standalone/server.js
```

SEE IN GUI

```
chrome://inspect/#devices
```
