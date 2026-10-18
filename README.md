# 1D Thermal Resistance Calculator

A static, client-side web calculator for the steady-state 1D thermal resistance network in
`source_model/model.py`. It predicts heat flux and the foil-face/composite-back temperatures for a
heat source separated from a composite plate by a stagnant air gap.

The calculator runs entirely in the browser. There is no API, database, or server runtime, so the
built site can be hosted on any static file host.

## Features

- Live calculation while editing inputs
- Conduction, linearised radiation and natural convection
- Air-gap and back-surface radiation treated as parallel resistances
- Detailed resistance breakdown, temperature profile chart and convergence status
- Core inputs visible, with optical properties and solver settings under **Advanced settings**
- Source-model defaults reproduced exactly
- Accessible, responsive light/dark UI
- No runtime dependencies beyond Astro

## Model defaults

| Parameter | Default |
| --- | ---: |
| Heat source temperature, `T_hot` | 600 °C |
| Ambient temperature, `T_inf` | 30 °C |
| Air gap thickness | 40 mm |
| Composite plate thickness | 3 mm |
| Plate through-thickness conductivity | 0.8 W/(m·K) |
| Source / foil / back emissivity | 0.90 / 0.05 / 0.88 |
| Back-surface convection coefficient | 5.0 W/(m²·K) |
| Air conductivity fit | `0.0243 + 7.7e-5 · T[°C]` |
| Solver tolerance / max iterations / relaxation | `1e-4 K` / `1000` / `0.5` |

With these defaults the model gives approximately:

- Heat flux: `2103.35 W/m²`
- Foil-face temperature `T1`: `173.39 °C`
- Composite-back temperature `T2`: `165.50 °C`
- Convergence: 24 iterations

The ambient temperature is used consistently at the back boundary and in back-surface radiation.

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
| `npm test` | Run the model unit tests |
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
  model.py            Reference Python implementation
  model.md            Model notes and equations
src/
  components/
    Calculator.astro  Calculator UI and client-side interaction
  layouts/
    Layout.astro      Page shell and design tokens
  lib/
    thermalModel.ts   Typed model port, defaults and validation
  pages/
    index.astro       Single-page calculator route
tests/
  thermalModel.test.ts
public/
  favicon.svg
```

## Model notes

The network has four temperature nodes: source, foil face, composite back and ambient. The solver
uses damped fixed-point iteration because air conductivity and the linearised radiation coefficients
depend on the unknown node temperatures.

Assumptions include steady-state 1D heat transfer, constant plate conductivity and back convection
coefficient, radiation between infinite parallel plates, and the linear air conductivity fit intended
for roughly 300–900 K. Results are reported per unit area.
