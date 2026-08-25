# clients/ — local only, never committed

Real client data and generated plans live here. Everything in this directory except
this README is **git-ignored**: it stays on this machine and is never pushed.

Layout per client:

```
clients/<client-name>/
  client-data.json   ← their inputs (from the /financial-plan skill)
  plan.html          ← the generated interactive plan
```
