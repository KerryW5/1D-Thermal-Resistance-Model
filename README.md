# 1D Thermal Network Calculator

A static, client-side calculator for steady-state heat transfer through a configurable series
network of materials and interfaces.

The original Python model is preserved in `source_model/model.py`. The web app generalises it into a
node-based stack: a heat source, any number of material layers, and an ambient sink. Every connection
between nodes can be an air gap, a bonded contact, an adhesive layer, or a specified contact
resistance.

All calculation happens in the browser. There is no API, database, or server runtime, so the built
site can be hosted on any static file host.

## Features

- Add, remove and reorder material layers
- Material presets for carbon fibre, Nomex honeycomb, glass fibre, aluminium, stainless steel, aerogel and custom materials
- Connection types: air gap, bonded, adhesive layer and contact resistance
- Per-side surface finishes: bare material, reflective foil or custom emissivity
- Air-gap conduction in parallel with linearised radiation
- Back-surface convection and radiation at the ambient boundary
- Live heat flux, node temperatures, resistance breakdown and temperature-profile chart
- Convergence status and air-fit range warning
- Network templates, including the original single-layer Python benchmark
- Accessible, responsive light/dark UI with no runtime dependencies beyond Astro

## Default example

The app opens with the **Carbon fibre + Nomex example**:

1. Node 1 — heat source at 600 °C
2. 40 mm air gap
3. Node 2 — carbon fibre plate, 3 mm, `k = 0.8 W/(m·K)`, reflective foil on the front face
4. Bonded connection
5. Node 3 — Nomex honeycomb, 10 mm, `k = 0.06 W/(m·K)`
6. Ambient boundary at 30 °C with `h_conv = 5 W/(m²·K)`

Approximate default result:

- Heat flux: `1460.84 W/m²`
- Carbon fibre front/back: `381.32 / 375.84 °C`
- Nomex front/back: `375.84 / 132.37 °C`
- Total resistance: `0.3902 m²·K/W`

The **Source model · 1 layer** template reproduces the original Python benchmark:

- Heat flux: `2103.35 W/m²`
- Foil-face temperature `T1`: `173.39 °C`
- Composite-back temperature `T2`: `165.50 °C`
- Total resistance: `0.2710 m²·K/W`

## Model notes

The network contains four kinds of elements in series:

| Element | Resistance |
| --- | --- |
| Material layer | `R″ = L / k` |
| Air gap | Stagnant-air conduction in parallel with radiation |
| Bonded connection | `R″ = 0` |
| Adhesive layer | `R″ = L_adhesive / k_adhesive` |
| Contact resistance | User-specified `R″` |
| Ambient boundary | Convection in parallel with radiation |

Radiation is linearised between infinite parallel plates. The effective emissivity of an air gap is
calculated from the facing surface finishes. A surface set to **Bare** uses the material emissivity,
**Reflective foil** uses the global foil emissivity, and **Custom ε** uses the entered value.

Other assumptions:

- Steady-state, one-dimensional heat transfer with uniform heat flux
- Constant material conductivity
- No contact resistance for bonded connections
- Air conductivity uses the linear fit `k_air = 0.0243 + 7.7e-5 · T[°C]`, intended for roughly 300–900 K
- Damped fixed-point iteration solves the temperature-dependent resistances

## Development

Node.js 22.22 or newer is required.

```sh
npm install
npm run dev
```

The dev server is available at `http://localhost:4321`.

Available scripts:

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local Astro dev server |
| `npm run build` | Build the static site to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run the model and configuration tests |
| `npm run check` | Run Astro/TypeScript diagnostics |

## Static deployment

```sh
npm run build
```

Deploy the contents of `dist/` to any static host (Netlify, Vercel, GitHub Pages, S3, nginx, etc.).
There are no server-side routes or environment variables.

If the site will be served from a subpath, configure Astro's
[`base`](https://docs.astro.build/en/reference/configuration-reference/#base) option in
`astro.config.mjs` before building.

## Project structure

```text
source_model/
  model.py              Reference Python implementation
  model.md              Original model notes and equations
src/
  components/
    Calculator.astro    Node-chain editor, results UI and client-side interaction
  layouts/
    Layout.astro        Page shell and design tokens
  lib/
    thermalModel.ts     Generalised series-network solver and validation
    networkConfig.ts    Materials, templates, surface finishes and UI-state validation
  pages/
    index.astro         Single-page calculator route
tests/
  thermalModel.test.ts  Solver benchmarks and physics tests
  networkConfig.test.ts Templates, surfaces and configuration validation
public/
  favicon.svg
```

## Units

- Temperatures: °C
- Lengths in inputs: mm
- Conductivity: W/(m·K)
- Areal resistance: m²·K/W
- Heat flux: W/m²
