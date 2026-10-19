# 1D Thermal Network Calculator

A static, client-side calculator for heat transfer through a configurable series network of
materials and interfaces. It supports two calculation modes:

- **Steady state** — solve the converged node temperatures and the constant heat flux
- **Transient** — step the thermal masses forward in time from `t = 0`

The original Python steady-state model is preserved in `source_model/model.py`. A new Python
transient reference implementation is in `source_model/transient_model.py`. Both are ported to
TypeScript for the web app.

All calculation happens in the browser. There is no API, database, or server runtime, so the built
site can be hosted on any static file host.

## Features

- Switch between steady-state and transient calculation
- Transient time step and final time default to **5 s** and **60 s**
- Add, remove and reorder material layers
- Material presets for carbon fibre, Nomex honeycomb, glass fibre, aluminium, stainless steel, aerogel and custom materials
- Density and specific heat fields for transient thermal mass
- Connection types: air gap, bonded, adhesive layer and contact resistance
- Per-side surface finishes: bare material, reflective foil or custom emissivity
- Air-gap conduction in parallel with linearised radiation
- Global air-gap convection factor in Advanced settings, applied to every air gap but not the ambient back boundary
- Per-air-gap assumed airflow dissipation in W/m²
- Back-surface convection and radiation at the ambient boundary
- Live heat flux, node temperatures, resistance breakdown and temperature-profile chart
- Transient temperature-history chart and time-history table
- Convergence status, air-fit range warning and transient completion status
- Network templates, including the original single-layer Python benchmark
- Accessible, responsive light/dark UI with no runtime dependencies beyond Astro

## Default example

The app opens in steady-state mode with the **Carbon fibre + Nomex example**:

1. Node 1 — heat source at 600 °C
2. 40 mm air gap
3. Node 2 — carbon fibre plate, 3 mm, `k = 0.8 W/(m·K)`, reflective foil on the front face
4. Bonded connection
5. Node 3 — Nomex honeycomb, 10 mm, `k = 0.06 W/(m·K)`
6. Ambient boundary at 30 °C with `h_conv = 5 W/(m²·K)`

Approximate steady-state result:

- Heat flux: `1460.84 W/m²`
- Carbon fibre front/back: `381.32 / 375.84 °C`
- Nomex front/back: `375.84 / 132.37 °C`
- Total resistance: `0.3902 m²·K/W`

The **Source model · 1 layer** template reproduces the original Python benchmark:

- Heat flux: `2103.35 W/m²`
- Foil-face temperature `T1`: `173.39 °C`
- Composite-back temperature `T2`: `165.50 °C`
- Total resistance: `0.2710 m²·K/W`

The **Setup1** template is also available in the template selector:

1. 800 °C heat source
2. 20 mm air gap
3. 1 mm aluminium sheet with reflective foil on the front
4. 20 mm air gap
5. 1 mm aluminium sheet with reflective foil on the front
6. Adhesive layer
7. 5 mm Nomex honeycomb
8. Adhesive layer
9. 2 mm carbon fibre plate
10. Ambient boundary at 30 °C

## Transient model

Transient mode starts all layer nodes at the selected initial temperature (default `30 °C`) and
holds the heat source at `T_hot` and the ambient boundary at `T_inf` for the whole run.

Each layer receives an areal thermal capacitance:

```text
C″ = ρ · cp · L
```

Half of that capacitance is assigned to the layer front node and half to the back node. The network
resistances are the same as in steady state. The solver uses implicit backward Euler at the selected
time step, which remains stable for stiff material combinations such as thin metals.

The default example produces the following transient results with `Δt = 5 s`, `t_final = 60 s`, and
an initial temperature of `30 °C`:

- Carbon fibre mean at 60 s: `56.36 °C` (front `58.70 °C`, back `54.02 °C`)
- Nomex mean at 60 s: `45.07 °C` (front `54.02 °C`, back `36.12 °C`)
- Ambient heat flux at 60 s: `66.42 W/m²`

The transient solution approaches the steady-state result when the final time is extended
sufficiently.

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

The Advanced settings include a global **air-gap convection factor** (default `1.0`). It multiplies
the air-side conduction/convection conductance in every air gap. Radiation is unchanged, and the
ambient back boundary is not scaled.

Each air-gap connection also accepts an assumed **airflow dissipation** in W/m². This heat is
removed from that gap, so the heat flux downstream of the gap is reduced by the specified amount.
The gap temperature drop is still evaluated with the upstream heat flux. This allows the source-side
and ambient-side heat fluxes to differ in steady state.

Other assumptions:

- One-dimensional heat transfer; heat flux is uniform along each segment and can change at gaps with airflow removal
- Constant material conductivity, density and specific heat
- No contact resistance for bonded connections
- Airflow dissipation removes heat at the downstream side of each air gap
- Air conductivity uses the linear fit `k_air = 0.0243 + 7.7e-5 · T[°C]`, intended for roughly 300–900 K
- Steady state uses damped fixed-point iteration
- Transient mode uses implicit backward Euler with temperature-dependent resistances lagged at each step
- Transient ΔT values are instantaneous surface differences at the final time

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
  model.py              Reference steady-state Python implementation
  transient_model.py    Reference transient Python implementation
  model.md              Original model notes and equations
src/
  components/
    Calculator.astro    Node-chain editor, results UI and client-side interaction
  layouts/
    Layout.astro        Page shell and design tokens
  lib/
    thermalModel.ts     Steady and transient series-network solvers
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
- Time: seconds
- Conductivity: W/(m·K)
- Density: kg/m³
- Specific heat: J/(kg·K)
- Areal thermal capacitance: J/(m²·K)
- Areal resistance: m²·K/W
- Heat flux: W/m²

