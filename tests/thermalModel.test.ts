import assert from 'node:assert/strict';
import test from 'node:test';
import {
	airConductivityK,
	effectiveGapEmissivity,
	solveThermalNetwork,
	validateNetworkInputs,
	type InterfaceInput,
	type LayerInput,
	type NetworkInputs,
} from '../src/lib/thermalModel.ts';

function makeLayer(overrides: Partial<LayerInput> = {}): LayerInput {
	return {
		id: 'layer-test',
		label: 'Composite plate',
		thicknessM: 0.003,
		conductivityWmK: 0.8,
		frontEmissivity: 0.05,
		backEmissivity: 0.88,
		...overrides,
	};
}

function makeInterface(overrides: Partial<InterfaceInput> = {}): InterfaceInput {
	return {
		type: 'air-gap',
		gapThicknessM: 0.04,
		adhesiveThicknessM: 0.0001,
		adhesiveConductivityWmK: 0.3,
		contactResistanceM2KW: 0.001,
		...overrides,
	};
}

function makeNetwork(overrides: Partial<NetworkInputs> = {}): NetworkInputs {
	return {
		sourceTemperatureC: 600,
		ambientTemperatureC: 30,
		sourceEmissivity: 0.9,
		layers: [makeLayer()],
		interfaces: [makeInterface()],
		backConvectionWm2K: 5,
		airFitIntercept: 0.0243,
		airFitSlope: 7.7e-5,
		toleranceK: 1e-4,
		maxIterations: 1000,
		relaxation: 0.5,
		...overrides,
	};
}

function closeTo(actual: number, expected: number, tolerance: number, label: string): void {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`${label}: expected ${expected}, received ${actual}`,
	);
}

test('the single-layer network reproduces the Python reference solution', () => {
	const result = solveThermalNetwork(makeNetwork());

	assert.equal(result.converged, true);
	assert.ok(result.iterations > 0);
	assert.ok(result.errorK <= 1e-4);
	closeTo(result.heatFluxWm2, 2103.353897405936, 1e-3, 'heat flux');
	closeTo(result.layers[0].frontTemperatureC, 173.3854118888301, 1e-3, 'front temperature');
	closeTo(result.layers[0].backTemperatureC, 165.49780327620692, 1e-3, 'back temperature');
	closeTo(result.interfaces[0].resistance, 0.2028258983801135, 1e-9, 'gap resistance');
	closeTo(result.layers[0].resistance, 0.00375, 1e-12, 'plate resistance');
	closeTo(result.back.resistance, 0.06441986733624089, 1e-9, 'back resistance');
	closeTo(result.totalResistance, 0.2709957657163544, 1e-9, 'total resistance');
	closeTo(
		result.interfaces[0].effectiveEmissivity ?? Number.NaN,
		0.049723756906077346,
		1e-12,
		'effective gap emissivity',
	);
	assert.equal(result.temperatureNodes.length, 4);
	assert.equal(result.layers[0].label, 'Composite plate');
	assert.equal(result.back.effectiveEmissivity, 0.88);
	assert.equal(result.airFitOutOfRange, false);
});

test('network temperatures and resistances satisfy the energy balance', () => {
	const result = solveThermalNetwork(makeNetwork());
	const hotK = 600 + 273.15;
	const ambientK = 30 + 273.15;

	closeTo(
		result.totalResistance,
		result.interfaces.reduce((sum, item) => sum + item.resistance, 0) +
			result.layers.reduce((sum, item) => sum + item.resistance, 0) +
			result.back.resistance,
		1e-12,
		'total resistance sum',
	);
	closeTo(result.heatFluxWm2, (hotK - ambientK) / result.totalResistance, 1e-9, 'flux equation');
	closeTo(result.interfaces[0].upstreamTemperatureC, 600, 1e-12, 'gap upstream temperature');
	closeTo(
		result.interfaces[0].downstreamTemperatureC,
		hotK - result.heatFluxWm2 * result.interfaces[0].resistance - 273.15,
		1e-3,
		'gap drop',
	);
	closeTo(
		result.layers[0].frontTemperatureC - result.layers[0].backTemperatureC,
		result.heatFluxWm2 * result.layers[0].resistance,
		1e-3,
		'layer drop',
	);
	closeTo(
		result.layers[0].backTemperatureC - result.ambientTemperatureC,
		result.heatFluxWm2 * result.back.resistance,
		1e-3,
		'back drop',
	);
	closeTo(
		result.layers[0].meanTemperatureC,
		(result.layers[0].frontTemperatureC + result.layers[0].backTemperatureC) / 2,
		1e-12,
		'mean layer temperature',
	);
});

test('air conductivity and gap emissivity match the source correlations', () => {
	closeTo(airConductivityK(300, 0.0243, 7.7e-5), 0.02636745, 1e-12, 'air conductivity');
	closeTo(effectiveGapEmissivity(0.9, 0.05), 0.049723756906077346, 1e-12, 'gap emissivity');
});

test('all connection types produce the expected resistance', () => {
	const adhesive = solveThermalNetwork(
		makeNetwork({
			interfaces: [
				makeInterface({
					type: 'adhesive',
					adhesiveThicknessM: 0.0002,
					adhesiveConductivityWmK: 0.4,
					gapThicknessM: Number.NaN,
				}),
			],
		}),
	);
	closeTo(adhesive.interfaces[0].resistance, 0.0005, 1e-12, 'adhesive resistance');

	const contact = solveThermalNetwork(
		makeNetwork({ interfaces: [makeInterface({ type: 'contact', contactResistanceM2KW: 0.002 })] }),
	);
	closeTo(contact.interfaces[0].resistance, 0.002, 1e-12, 'contact resistance');

	const bonded = solveThermalNetwork(
		makeNetwork({ interfaces: [makeInterface({ type: 'bonded' })] }),
	);
	assert.equal(bonded.interfaces[0].resistance, 0);
	closeTo(
		bonded.interfaces[0].upstreamTemperatureC,
		bonded.interfaces[0].downstreamTemperatureC,
		1e-3,
		'bonded interface temperature equality',
	);

	const airGap = solveThermalNetwork(makeNetwork());
	assert.ok((airGap.interfaces[0].conductionResistance ?? 0) > 0);
	assert.ok((airGap.interfaces[0].radiationResistance ?? 0) > 0);
	assert.ok((airGap.interfaces[0].effectiveEmissivity ?? 0) > 0);
});

test('the solver validates layers, interfaces and solver settings', () => {
	assert.deepEqual(validateNetworkInputs(makeNetwork()), []);

	const cases: Array<[Partial<NetworkInputs>, string]> = [
		[{ layers: [], interfaces: [] }, 'layers'],
		[{ interfaces: [makeInterface(), makeInterface()] }, 'interfaces'],
		[{ layers: [makeLayer({ thicknessM: 0 })] }, 'layers.0.thicknessM'],
		[{ layers: [makeLayer({ conductivityWmK: 0 })] }, 'layers.0.conductivityWmK'],
		[{ layers: [makeLayer({ frontEmissivity: 0 })] }, 'layers.0.frontEmissivity'],
		[{ layers: [makeLayer({ backEmissivity: 1.2 })] }, 'layers.0.backEmissivity'],
		[{ interfaces: [makeInterface({ gapThicknessM: 0 })] }, 'interfaces.0.gapThicknessM'],
		[
			{ interfaces: [makeInterface({ type: 'adhesive', adhesiveThicknessM: 0 })] },
			'interfaces.0.adhesiveThicknessM',
		],
		[
			{ interfaces: [makeInterface({ type: 'adhesive', adhesiveConductivityWmK: 0 })] },
			'interfaces.0.adhesiveConductivityWmK',
		],
		[
			{ interfaces: [makeInterface({ type: 'contact', contactResistanceM2KW: -1 })] },
			'interfaces.0.contactResistanceM2KW',
		],
		[{ backConvectionWm2K: 0 }, 'backConvectionWm2K'],
		[{ airFitIntercept: 0 }, 'airFitIntercept'],
		[{ airFitSlope: -1e-5 }, 'airFitSlope'],
		[{ toleranceK: 0 }, 'toleranceK'],
		[{ maxIterations: 0 }, 'maxIterations'],
		[{ maxIterations: 1.5 }, 'maxIterations'],
		[{ relaxation: 1.1 }, 'relaxation'],
		[{ sourceTemperatureC: 20 }, 'sourceTemperatureC'],
		[{ ambientTemperatureC: -300 }, 'ambientTemperatureC'],
		[{ sourceEmissivity: 0 }, 'sourceEmissivity'],
	];

	for (const [overrides, path] of cases) {
		const issues = validateNetworkInputs(makeNetwork(overrides));
		assert.ok(
			issues.some((entry) => entry.path === path),
			`expected an issue for ${path}`,
		);
	}

	assert.throws(() => solveThermalNetwork(makeNetwork({ layers: [] })));
});

test('the solver reports non-convergence without losing finite results', () => {
	const result = solveThermalNetwork(makeNetwork({ maxIterations: 1 }));
	assert.equal(result.converged, false);
	assert.equal(result.iterations, 1);
	assert.ok(Number.isFinite(result.heatFluxWm2));
	assert.ok(Number.isFinite(result.totalResistance));
	assert.ok(result.temperatureNodes.length >= 4);
});

test('physical trends respond in the expected direction', () => {
	const baseline = solveThermalNetwork(makeNetwork());
	const widerGap = solveThermalNetwork(
		makeNetwork({ interfaces: [makeInterface({ gapThicknessM: 0.08 })] }),
	);
	const hotterSource = solveThermalNetwork(makeNetwork({ sourceTemperatureC: 700 }));
	const shinierFoil = solveThermalNetwork(
		makeNetwork({ layers: [makeLayer({ frontEmissivity: 0.9 })] }),
	);
	const extraLayer = solveThermalNetwork(
		makeNetwork({
			layers: [
				makeLayer(),
				makeLayer({
					id: 'layer-nomex',
					label: 'Nomex honeycomb',
					thicknessM: 0.01,
					conductivityWmK: 0.06,
					frontEmissivity: 0.9,
					backEmissivity: 0.9,
				}),
			],
			interfaces: [makeInterface(), makeInterface({ type: 'bonded' })],
		}),
	);

	assert.ok(widerGap.heatFluxWm2 < baseline.heatFluxWm2);
	assert.ok(widerGap.interfaces[0].resistance > baseline.interfaces[0].resistance);
	assert.ok(hotterSource.heatFluxWm2 > baseline.heatFluxWm2);
	assert.ok((shinierFoil.interfaces[0].radiationResistance ?? Infinity) < (baseline.interfaces[0].radiationResistance ?? 0));
	assert.ok(shinierFoil.heatFluxWm2 > baseline.heatFluxWm2);
	assert.ok(extraLayer.heatFluxWm2 < baseline.heatFluxWm2);
	assert.equal(extraLayer.layers.length, 2);
});

test('the air-fit range flag responds to gap mean temperature', () => {
	const hot = solveThermalNetwork(makeNetwork({ sourceTemperatureC: 1500 }));
	assert.equal(hot.airFitOutOfRange, true);
});
