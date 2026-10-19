import assert from 'node:assert/strict';
import test from 'node:test';
import {
	airConductivityK,
	effectiveGapEmissivity,
	solveThermalNetwork,
	solveTransientNetwork,
	validateNetworkInputs,
	validateTransientInputs,
	type InterfaceInput,
	type LayerInput,
	type NetworkInputs,
	type TransientSettings,
} from '../src/lib/thermalModel.ts';

function makeLayer(overrides: Partial<LayerInput> = {}): LayerInput {
	return {
		id: 'layer-test',
		label: 'Composite plate',
		thicknessM: 0.003,
		conductivityWmK: 0.8,
		densityKgM3: 1600,
		specificHeatJkgK: 1000,
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
		gapConvectionFactor: 1,
		toleranceK: 1e-4,
		maxIterations: 1000,
		relaxation: 0.5,
		...overrides,
	};
}

function makeTwoLayerNetwork(): NetworkInputs {
	return makeNetwork({
		layers: [
			makeLayer({
				id: 'layer-cfp',
				label: 'Carbon fibre plate',
			}),
			makeLayer({
				id: 'layer-nomex',
				label: 'Nomex honeycomb',
				thicknessM: 0.01,
				conductivityWmK: 0.06,
				densityKgM3: 48,
				specificHeatJkgK: 1200,
				frontEmissivity: 0.9,
				backEmissivity: 0.9,
			}),
		],
		interfaces: [makeInterface(), makeInterface({ type: 'bonded' })],
	});
}

function transientSettings(overrides: Partial<TransientSettings> = {}): TransientSettings {
	return {
		timeStepS: 5,
		finalTimeS: 60,
		initialTemperatureC: 30,
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
	closeTo(result.interfaces[0].resistance, 0.2028258983801135, 1e-6, 'gap resistance');
	closeTo(result.layers[0].resistance, 0.00375, 1e-12, 'plate resistance');
	closeTo(result.back.resistance, 0.06441986733624089, 1e-6, 'back resistance');
	closeTo(result.totalResistance, 0.2709957657163544, 1e-6, 'total resistance');
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
	closeTo(result.heatFluxWm2, (hotK - ambientK) / result.totalResistance, 1e-2, 'flux equation');
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

test('the air-gap convection factor scales all gaps and excludes the back boundary', () => {
	const baseline = solveThermalNetwork(makeNetwork());
	const enhanced = solveThermalNetwork(makeNetwork({ gapConvectionFactor: 2 }));
	const firstGap = enhanced.interfaces[0];
	closeTo(
		firstGap.conductionResistance ?? Number.NaN,
		(firstGap.gapThicknessM ?? 0) / ((firstGap.airConductivityWmK ?? 0) * 2),
		1e-12,
		'first gap conduction resistance',
	);
	assert.ok(firstGap.resistance < baseline.interfaces[0].resistance);
	assert.ok(enhanced.heatFluxWm2 > baseline.heatFluxWm2);
	assert.equal(firstGap.gapConvectionFactor, 2);

	const twoGaps = makeTwoLayerNetwork();
	twoGaps.interfaces[1] = makeInterface({ type: 'air-gap', gapThicknessM: 0.02 });
	const twoGapsEnhanced = solveThermalNetwork({ ...twoGaps, gapConvectionFactor: 2 });
	for (let index = 0; index < 2; index += 1) {
		const gap = twoGapsEnhanced.interfaces[index];
		closeTo(
			gap.conductionResistance ?? Number.NaN,
			(gap.gapThicknessM ?? 0) / ((gap.airConductivityWmK ?? 0) * 2),
			1e-12,
			`gap ${index} conduction resistance`,
		);
		assert.equal(gap.gapConvectionFactor, 2);
	}

	const bondedOnly = makeNetwork({
		interfaces: [makeInterface({ type: 'bonded' })],
		gapConvectionFactor: 10,
	});
	const bondedOnlyBase = solveThermalNetwork(
		makeNetwork({ interfaces: [makeInterface({ type: 'bonded' })], gapConvectionFactor: 1 }),
	);
	const bondedEnhanced = solveThermalNetwork(bondedOnly);
	closeTo(
		bondedEnhanced.heatFluxWm2,
		bondedOnlyBase.heatFluxWm2,
		1e-12,
		'factor does not affect bonded-only network',
	);
	closeTo(
		bondedEnhanced.back.resistance,
		bondedOnlyBase.back.resistance,
		1e-12,
		'factor does not affect back boundary',
	);
});

test('air-gap airflow dissipation reduces the downstream heat flux', () => {
	const result = solveThermalNetwork(
		makeNetwork({
			interfaces: [makeInterface({ dissipationWm2: 50 })],
		}),
	);

	closeTo(result.sourceHeatFluxWm2, result.heatFluxWm2, 1e-12, 'source flux');
	closeTo(
		result.sourceHeatFluxWm2 - result.ambientHeatFluxWm2,
		50,
		1e-9,
		'gap dissipation',
	);
	closeTo(result.totalDissipationWm2, 50, 1e-12, 'total dissipation');
	closeTo(
		result.interfaces[0].temperatureDropK / result.interfaces[0].resistance,
		result.sourceHeatFluxWm2,
		1e-2,
		'gap carries source-side flux',
	);
	closeTo(
		result.layers[0].temperatureDropK / result.layers[0].resistance,
		result.ambientHeatFluxWm2,
		1e-2,
		'downstream layer carries ambient-side flux',
	);
	closeTo(
		result.back.temperatureDropK / result.back.resistance,
		result.ambientHeatFluxWm2,
		1e-2,
		'back boundary carries ambient-side flux',
	);
	assert.equal(result.interfaces[0].dissipationWm2, 50);

	const twoGaps = makeTwoLayerNetwork();
	twoGaps.interfaces[0] = makeInterface({ dissipationWm2: 20 });
	twoGaps.interfaces[1] = makeInterface({
		type: 'air-gap',
		gapThicknessM: 0.02,
		dissipationWm2: 30,
	});
	const twoGapResult = solveThermalNetwork(twoGaps);
	closeTo(
		twoGapResult.sourceHeatFluxWm2 - twoGapResult.ambientHeatFluxWm2,
		50,
		1e-9,
		'two-gap total dissipation',
	);
	closeTo(
		twoGapResult.interfaces[1].temperatureDropK /
			twoGapResult.interfaces[1].resistance,
		twoGapResult.sourceHeatFluxWm2 - 20,
		1e-2,
		'second gap carries the reduced flux',
	);
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
			{ interfaces: [makeInterface({ dissipationWm2: -1 })] },
			'interfaces.0.dissipationWm2',
		],
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
		[{ gapConvectionFactor: 0 }, 'gapConvectionFactor'],
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

test('the transient model matches the Python reference time history', () => {
	const result = solveTransientNetwork(makeTwoLayerNetwork(), transientSettings());

	assert.equal(result.steps.length, 13);
	assert.deepEqual(
		result.steps.map((step) => step.timeS),
		[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
	);
	closeTo(result.steps[0].layerMeanTemperaturesC[0], 30, 1e-12, 'initial carbon mean');
	closeTo(result.steps[1].layerMeanTemperaturesC[0], 32.312915443057136, 1e-6, '5 s carbon mean');
	closeTo(result.steps[1].layerMeanTemperaturesC[1], 30.619252370530262, 1e-6, '5 s nomex mean');

	const finalStep = result.steps[result.steps.length - 1];
	closeTo(finalStep.layerMeanTemperaturesC[0], 56.36244830234483, 1e-6, '60 s carbon mean');
	closeTo(finalStep.layerMeanTemperaturesC[1], 45.06986934048166, 1e-6, '60 s nomex mean');
	closeTo(finalStep.nodeTemperaturesC[0], 58.700672978061675, 1e-6, 'carbon front');
	closeTo(finalStep.nodeTemperaturesC[1], 54.024223626627986, 1e-6, 'carbon back');
	closeTo(finalStep.nodeTemperaturesC[2], 54.02422339707567, 1e-6, 'nomex front');
	closeTo(finalStep.nodeTemperaturesC[3], 36.11551528388759, 1e-6, 'nomex back');
	closeTo(finalStep.ambientHeatFluxWm2, 66.42108280755406, 1e-6, 'final ambient flux');
	assert.ok((finalStep.sourceHeatFluxWm2 ?? 0) > finalStep.ambientHeatFluxWm2);

	closeTo(result.final.layers[0].frontTemperatureC, 58.700672978061675, 1e-6, 'snapshot front');
	closeTo(result.final.layers[1].backTemperatureC, 36.11551528388759, 1e-6, 'snapshot back');
	assert.equal(result.final.layers.length, 2);
	assert.equal(result.final.interfaces.length, 2);
});

test('the transient model approaches the steady-state solution over a long run', () => {
	const inputs = makeTwoLayerNetwork();
	const steady = solveThermalNetwork(inputs);
	const transient = solveTransientNetwork(
		inputs,
		transientSettings({ timeStepS: 20, finalTimeS: 20000 }),
	);
	const final = transient.final;

	for (let index = 0; index < steady.layers.length; index += 1) {
		closeTo(
			final.layers[index].frontTemperatureC,
			steady.layers[index].frontTemperatureC,
			0.05,
			`layer ${index} front approach`,
		);
		closeTo(
			final.layers[index].backTemperatureC,
			steady.layers[index].backTemperatureC,
			0.05,
			`layer ${index} back approach`,
		);
	}
	closeTo(
		transient.steps[transient.steps.length - 1].ambientHeatFluxWm2,
		steady.heatFluxWm2,
		0.1,
		'approach flux',
	);
});

test('transient gap dissipation approaches the steady-state flux split', () => {
	const inputs = makeNetwork({
		interfaces: [makeInterface({ dissipationWm2: 50 })],
	});
	const steady = solveThermalNetwork(inputs);
	const transient = solveTransientNetwork(
		inputs,
		transientSettings({ timeStepS: 20, finalTimeS: 20000 }),
	);
	const finalStep = transient.steps[transient.steps.length - 1];

	closeTo(
		finalStep.ambientHeatFluxWm2,
		steady.ambientHeatFluxWm2,
		0.1,
		'transient ambient flux',
	);
	closeTo(
		finalStep.sourceHeatFluxWm2 ?? Number.NaN,
		steady.sourceHeatFluxWm2,
		0.1,
		'transient source flux',
	);
	closeTo(
		finalStep.layerMeanTemperaturesC[0],
		steady.layers[0].meanTemperatureC,
		0.05,
		'transient layer temperature',
	);
});

test('transient validation checks time settings and thermal mass', () => {
	assert.deepEqual(validateTransientInputs(makeTwoLayerNetwork(), transientSettings()), []);

	const noSteadySolver = makeTwoLayerNetwork();
	noSteadySolver.toleranceK = 0;
	noSteadySolver.maxIterations = 0;
	noSteadySolver.relaxation = 0;
	assert.deepEqual(validateTransientInputs(noSteadySolver, transientSettings()), []);
	assert.ok(
		solveTransientNetwork(noSteadySolver, transientSettings()).steps.length > 1,
	);

	const cases: Array<[Partial<TransientSettings>, string]> = [
		[{ timeStepS: 0 }, 'timeStepS'],
		[{ finalTimeS: 0 }, 'finalTimeS'],
		[{ initialTemperatureC: -300 }, 'initialTemperatureC'],
		[{ timeStepS: 0.0001, finalTimeS: 60 }, 'finalTimeS'],
	];
	for (const [overrides, path] of cases) {
		const issues = validateTransientInputs(
			makeTwoLayerNetwork(),
			transientSettings(overrides),
		);
		assert.ok(
			issues.some((entry) => entry.path === path),
			`expected a transient issue for ${path}`,
		);
	}

	const noDensity = makeTwoLayerNetwork();
	noDensity.layers[0].densityKgM3 = 0;
	assert.ok(
		validateTransientInputs(noDensity, transientSettings()).some(
			(entry) => entry.path === 'layers.0.densityKgM3',
		),
	);

	const noSpecificHeat = makeTwoLayerNetwork();
	noSpecificHeat.layers[0].specificHeatJkgK = 0;
	assert.ok(
		validateTransientInputs(noSpecificHeat, transientSettings()).some(
			(entry) => entry.path === 'layers.0.specificHeatJkgK',
		),
	);

	assert.throws(() =>
		solveTransientNetwork(makeTwoLayerNetwork(), transientSettings({ timeStepS: 0 })),
	);
});

test('the transient source flux is unavailable when the first link is bonded', () => {
	const inputs = makeTwoLayerNetwork();
	inputs.interfaces[0] = makeInterface({ type: 'bonded' });
	const result = solveTransientNetwork(inputs, transientSettings());
	assert.equal(result.steps[0].sourceHeatFluxWm2, null);
	assert.ok(Number.isFinite(result.steps[0].ambientHeatFluxWm2));
});

test('transient stepping remains stable for a stiff metal layer', () => {
	const inputs = makeNetwork({
		layers: [
			makeLayer({
				thicknessM: 0.002,
				conductivityWmK: 205,
				densityKgM3: 2700,
				specificHeatJkgK: 900,
				frontEmissivity: 0.1,
				backEmissivity: 0.1,
			}),
		],
	});
	const result = solveTransientNetwork(inputs, transientSettings());
	const final = result.steps[result.steps.length - 1];
	assert.equal(result.steps.length, 13);
	assert.ok(final.nodeTemperaturesC.every((temperature) => Number.isFinite(temperature)));
	assert.ok(Number.isFinite(final.ambientHeatFluxWm2));
	assert.ok(Number.isFinite(result.final.totalResistance));
});
