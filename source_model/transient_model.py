"""
Transient 1D thermal-network reference model.

Each material layer is represented by a front and a back surface node with half
of the layer heat capacity assigned to each node. The existing series
resistances connect the nodes, the heat-source boundary is held at T_hot and the
ambient boundary is held at T_inf. Time integration uses backward Euler with
resistances evaluated at the beginning of each step, which keeps the update
stable for arbitrary layer properties and the default 5 s time step.
"""

STEFAN_BOLTZMANN = 5.67e-8
KELVIN_OFFSET = 273.15
MAX_CONDUCTANCE = 1e9


class MaterialLayer:
    def __init__(
        self,
        label,
        thickness,
        conductivity,
        density,
        specific_heat,
        front_emissivity,
        back_emissivity,
    ):
        self.label = label
        self.thickness = thickness
        self.conductivity = conductivity
        self.density = density
        self.specific_heat = specific_heat
        self.front_emissivity = front_emissivity
        self.back_emissivity = back_emissivity

    @property
    def heat_capacity(self):
        return self.density * self.specific_heat * self.thickness

    @property
    def conduction_resistance(self):
        return self.thickness / self.conductivity


class Connection:
    def __init__(
        self,
        kind="bonded",
        gap_thickness=0.005,
        dissipation_w_m2=0.0,
        adhesive_thickness=0.0001,
        adhesive_conductivity=0.3,
        contact_resistance=0.001,
    ):
        self.kind = kind
        self.gap_thickness = gap_thickness
        self.dissipation_w_m2 = dissipation_w_m2
        self.adhesive_thickness = adhesive_thickness
        self.adhesive_conductivity = adhesive_conductivity
        self.contact_resistance = contact_resistance

    def evaluate(
        self,
        upstream_k,
        downstream_k,
        upstream_emissivity,
        downstream_emissivity,
        air_fit_intercept,
        air_fit_slope,
        gap_convection_factor=1.0,
    ):
        if self.kind == "bonded":
            return {"type": self.kind, "resistance": 0.0}

        if self.kind == "adhesive":
            resistance = self.adhesive_thickness / self.adhesive_conductivity
            return {"type": self.kind, "resistance": resistance}

        if self.kind == "contact":
            return {"type": self.kind, "resistance": self.contact_resistance}

        gap_mean_k = (upstream_k + downstream_k) / 2.0
        conductivity = air_fit_intercept + air_fit_slope * (gap_mean_k - KELVIN_OFFSET)
        effective_conductivity = conductivity * gap_convection_factor
        conduction_resistance = self.gap_thickness / effective_conductivity
        gap_emissivity = 1.0 / (
            1.0 / upstream_emissivity + 1.0 / downstream_emissivity - 1.0
        )
        radiation_coefficient = (
            STEFAN_BOLTZMANN
            * gap_emissivity
            * (upstream_k**2 + downstream_k**2)
            * (upstream_k + downstream_k)
        )
        radiation_resistance = 1.0 / radiation_coefficient
        resistance = 1.0 / (
            1.0 / conduction_resistance + 1.0 / radiation_resistance
        )
        return {
            "type": self.kind,
            "resistance": resistance,
            "gap_mean_k": gap_mean_k,
            "conductivity": conductivity,
            "gap_convection_factor": gap_convection_factor,
            "dissipation_w_m2": self.dissipation_w_m2,
            "conduction_resistance": conduction_resistance,
            "radiation_resistance": radiation_resistance,
            "effective_emissivity": gap_emissivity,
        }


class TransientThermalNetwork:
    def __init__(self):
        self.source_temperature_c = 600.0
        self.ambient_temperature_c = 30.0
        self.source_emissivity = 0.90
        self.layers = [
            MaterialLayer(
                "Carbon fibre plate",
                0.003,
                0.8,
                1600.0,
                1000.0,
                0.05,
                0.88,
            ),
            MaterialLayer(
                "Nomex honeycomb",
                0.010,
                0.06,
                48.0,
                1200.0,
                0.90,
                0.90,
            ),
        ]
        self.connections = [
            Connection("air-gap", gap_thickness=0.040),
            Connection("bonded"),
        ]
        self.back_convection = 5.0
        self.air_fit_intercept = 0.0243
        self.air_fit_slope = 7.7e-5
        self.gap_convection_factor = 1.0
        self.initial_temperature_c = 30.0
        self.time_step_s = 5.0
        self.final_time_s = 60.0

    def _evaluate_network(self, node_temperatures_k):
        source_k = self.source_temperature_c + KELVIN_OFFSET
        ambient_k = self.ambient_temperature_c + KELVIN_OFFSET
        interface_results = []

        for index, connection in enumerate(self.connections):
            upstream_k = source_k if index == 0 else node_temperatures_k[2 * index - 1]
            downstream_k = node_temperatures_k[2 * index]
            upstream_emissivity = (
                self.source_emissivity
                if index == 0
                else self.layers[index - 1].back_emissivity
            )
            downstream_emissivity = self.layers[index].front_emissivity
            detail = connection.evaluate(
                upstream_k,
                downstream_k,
                upstream_emissivity,
                downstream_emissivity,
                self.air_fit_intercept,
                self.air_fit_slope,
                self.gap_convection_factor,
            )
            detail["upstream_k"] = upstream_k
            detail["downstream_k"] = downstream_k
            interface_results.append(detail)

        layer_resistances = [layer.conduction_resistance for layer in self.layers]

        last_surface_k = node_temperatures_k[-1]
        back_emissivity = self.layers[-1].back_emissivity
        back_radiation_coefficient = (
            STEFAN_BOLTZMANN
            * back_emissivity
            * (last_surface_k**2 + ambient_k**2)
            * (last_surface_k + ambient_k)
        )
        back_convection_resistance = 1.0 / self.back_convection
        back_radiation_resistance = 1.0 / back_radiation_coefficient
        back_resistance = 1.0 / (
            1.0 / back_convection_resistance + 1.0 / back_radiation_resistance
        )

        return {
            "interfaces": interface_results,
            "layer_resistances": layer_resistances,
            "back_resistance": back_resistance,
            "back_convection_resistance": back_convection_resistance,
            "back_radiation_resistance": back_radiation_resistance,
        }

    def _record(self, time_s, node_temperatures_k):
        evaluation = self._evaluate_network(node_temperatures_k)
        ambient_k = self.ambient_temperature_c + KELVIN_OFFSET
        source_k = self.source_temperature_c + KELVIN_OFFSET
        layer_means = [
            (
                node_temperatures_k[2 * index]
                + node_temperatures_k[2 * index + 1]
            )
            / 2.0
            - KELVIN_OFFSET
            for index in range(len(self.layers))
        ]
        first_resistance = evaluation["interfaces"][0]["resistance"]
        source_heat_flux = (
            (source_k - node_temperatures_k[0]) / first_resistance
            if first_resistance > 0
            else None
        )
        ambient_heat_flux = (
            node_temperatures_k[-1] - ambient_k
        ) / evaluation["back_resistance"]
        return {
            "time_s": time_s,
            "node_temperatures_c": [
                value - KELVIN_OFFSET for value in node_temperatures_k
            ],
            "layer_mean_temperatures_c": layer_means,
            "source_heat_flux_w_m2": source_heat_flux,
            "ambient_heat_flux_w_m2": ambient_heat_flux,
            "evaluation": evaluation,
        }

    def _solve_tridiagonal(self, lower, diagonal, upper, rhs):
        node_count = len(diagonal)
        modified_upper = [0.0] * node_count
        modified_rhs = [0.0] * node_count
        modified_upper[0] = upper[0] / diagonal[0]
        modified_rhs[0] = rhs[0] / diagonal[0]

        for index in range(1, node_count):
            denominator = diagonal[index] - lower[index] * modified_upper[index - 1]
            modified_upper[index] = (
                upper[index] / denominator if index < node_count - 1 else 0.0
            )
            modified_rhs[index] = (
                rhs[index] - lower[index] * modified_rhs[index - 1]
            ) / denominator

        solution = [0.0] * node_count
        solution[-1] = modified_rhs[-1]
        for index in range(node_count - 2, -1, -1):
            solution[index] = (
                modified_rhs[index] - modified_upper[index] * solution[index + 1]
            )
        return solution

    def solve(self):
        if self.time_step_s <= 0 or self.final_time_s <= 0:
            raise ValueError("Time step and final time must be positive.")
        if len(self.connections) != len(self.layers):
            raise ValueError("Each layer must have one incoming connection.")
        if self.gap_convection_factor <= 0:
            raise ValueError("Air-gap convection factor must be greater than zero.")
        if any(connection.dissipation_w_m2 < 0 for connection in self.connections):
            raise ValueError("Air-gap dissipation must be non-negative.")

        source_k = self.source_temperature_c + KELVIN_OFFSET
        ambient_k = self.ambient_temperature_c + KELVIN_OFFSET
        initial_k = self.initial_temperature_c + KELVIN_OFFSET
        node_count = 2 * len(self.layers)
        node_temperatures_k = [initial_k] * node_count
        capacities = []
        for layer in self.layers:
            half_capacity = layer.heat_capacity / 2.0
            capacities.extend([half_capacity, half_capacity])

        times = [0.0]
        current_time = 0.0
        while current_time < self.final_time_s - 1e-12:
            current_time = min(current_time + self.time_step_s, self.final_time_s)
            times.append(current_time)

        steps = [self._record(0.0, node_temperatures_k)]
        for step_index in range(1, len(times)):
            step_s = times[step_index] - times[step_index - 1]
            evaluation = self._evaluate_network(node_temperatures_k)
            conductances = []
            for index, detail in enumerate(evaluation["interfaces"]):
                resistance = detail["resistance"]
                conductances.append(
                    1.0 / resistance if resistance > 0 else MAX_CONDUCTANCE
                )
                conductances.append(1.0 / evaluation["layer_resistances"][index])
            conductances.append(1.0 / evaluation["back_resistance"])

            lower = [0.0] * node_count
            diagonal = [0.0] * node_count
            upper = [0.0] * node_count
            rhs = [0.0] * node_count

            for index in range(node_count):
                left_conductance = conductances[index]
                right_conductance = conductances[index + 1]
                capacitance_term = capacities[index] / step_s
                diagonal[index] = (
                    capacitance_term + left_conductance + right_conductance
                )
                rhs[index] = capacitance_term * node_temperatures_k[index]
                if index > 0:
                    lower[index] = -left_conductance
                else:
                    rhs[index] += left_conductance * source_k
                if index < node_count - 1:
                    upper[index] = -right_conductance
                else:
                    rhs[index] += right_conductance * ambient_k

            for index, connection in enumerate(self.connections):
                if connection.kind == "air-gap" and connection.dissipation_w_m2 != 0:
                    rhs[2 * index] -= connection.dissipation_w_m2

            node_temperatures_k = self._solve_tridiagonal(
                lower, diagonal, upper, rhs
            )
            steps.append(self._record(times[step_index], node_temperatures_k))

        return {
            "times_s": times,
            "steps": steps,
            "final_evaluation": steps[-1]["evaluation"],
        }


if __name__ == "__main__":
    model = TransientThermalNetwork()
    results = model.solve()

    print("=== Transient 1D Thermal Model ===")
    print(
        f"Time step: {model.time_step_s:.2f} s    Final time: {model.final_time_s:.2f} s"
    )
    print()
    print("Time [s]   " + "   ".join(f"{layer.label:>20}" for layer in model.layers))
    for step in results["steps"]:
        means = "   ".join(
            f"{value:20.3f}" for value in step["layer_mean_temperatures_c"]
        )
        print(f"{step['time_s']:8.1f}   {means}")

    final = results["steps"][-1]
    print()
    print("Final surface temperatures:")
    for index, layer in enumerate(model.layers):
        front = final["node_temperatures_c"][2 * index]
        back = final["node_temperatures_c"][2 * index + 1]
        print(f"  {layer.label}: front {front:.3f} °C, back {back:.3f} °C")
    print(
        f"Ambient heat flux at final time: {final['ambient_heat_flux_w_m2']:.3f} W/m^2"
    )
