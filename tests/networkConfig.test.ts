import assert from 'node:assert/strict';
import test from 'node:test';
import { solveThermalNetwork } from '../src/lib/thermalModel.ts';
import {
	DEFAULT_TEMPLATE_ID,
	applyMaterialToLayer,
	applyTemplate,
	buildNetworkInputs,
	createInitialState,
	createInterface,
	getTemplate,
	resolveSurfaceEmissivity,
	validateNetworkState,
} from '../src/lib/networkConfig.ts';

function closeTo(actual: number, expected: number, tolerance: number, label: string): void {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`${label}: expected ${expected}, received ${actual}`,
	);
}

test('the default example is the carbon fibre plus Nomex network', () => {
	const state = createInitialState();

	assert.equal(state.templateId, DEFAULT_TEMPLATE_ID);
	assert.equal(state.modelMode, 'steady');
	assert.equal(state.timeStepS, 5);
	assert.equal(state.finalTimeS, 60);
	assert.equal(state.initialTemperatureC, 30);
	assert.equal(state.layers.length, 2);
	assert.equal(state.layers[0].label, 'Carbon fibre plate');
	assert.equal(state.layers[1].label, 'Nomex honeycomb');
	assert.equal(state.interfaces[0].type, 'air-gap');
	assert.equal(state.interfaces[0].dissipationWm2, 0);
	assert.equal(state.interfaces[1].type, 'bonded');
	assert.deepEqual(validateNetworkState(state), []);

	const inputs = buildNetworkInputs(state);
	assert.equal(inputs.layers.length, 2);
	assert.equal(inputs.layers[0].thicknessM, 0.003);
	assert.equal(inputs.layers[0].densityKgM3, 1600);
	assert.equal(inputs.layers[0].specificHeatJkgK, 1000);
	assert.equal(inputs.layers[0].frontEmissivity, 0.05);
	assert.equal(inputs.layers[0].backEmissivity, 0.88);
	assert.equal(inputs.layers[1].densityKgM3, 48);
	assert.equal(inputs.layers[1].specificHeatJkgK, 1200);
	assert.equal(inputs.layers[1].frontEmissivity, 0.9);
	assert.equal(inputs.interfaces[0].gapThicknessM, 0.04);
	assert.equal(inputs.interfaces[0].dissipationWm2, 0);
	assert.equal(inputs.interfaces[1].type, 'bonded');
	assert.equal(inputs.gapConvectionFactor, 1);

	const result = solveThermalNetwork(inputs);
	assert.equal(result.converged, true);
	closeTo(result.heatFluxWm2, 1460.8442075974392, 1e-3, 'example heat flux');
	closeTo(result.layers[0].frontTemperatureC, 381.321583103795, 1e-3, 'carbon front');
	closeTo(result.layers[0].backTemperatureC, 375.8434140416481, 1e-3, 'carbon back');
	closeTo(result.layers[1].frontTemperatureC, 375.8434123429157, 1e-3, 'nomex front');
	closeTo(result.layers[1].backTemperatureC, 132.36930560353812, 1e-3, 'nomex back');
	closeTo(result.interfaces[1].resistance, 0, 1e-12, 'bonded resistance');
});

test('the source-model template reproduces the Python benchmark', () => {
	const state = createInitialState('source-model');
	assert.equal(state.layers.length, 1);
	assert.equal(state.layers[0].label, 'Composite plate');
	assert.equal(state.layers[0].thicknessMm, 3);
	assert.equal(state.interfaces[0].gapThicknessMm, 40);
	assert.deepEqual(validateNetworkState(state), []);

	const result = solveThermalNetwork(buildNetworkInputs(state));
	assert.equal(result.converged, true);
	closeTo(result.heatFluxWm2, 2103.353897405936, 1e-3, 'source-model heat flux');
	closeTo(result.layers[0].frontTemperatureC, 173.3854118888301, 1e-3, 'source-model front');
	closeTo(result.layers[0].backTemperatureC, 165.49780327620692, 1e-3, 'source-model back');
	closeTo(result.interfaces[0].resistance, 0.2028258983801135, 1e-6, 'source-model gap R');
	closeTo(result.layers[0].resistance, 0.00375, 1e-12, 'source-model plate R');
	closeTo(result.back.resistance, 0.06441986733624089, 1e-6, 'source-model back R');
});

test('the Setup1 template matches the requested stack', () => {
	const state = createInitialState('setup-1');

	assert.equal(state.sourceTemperatureC, 800);
	assert.equal(state.ambientTemperatureC, 30);
	assert.equal(state.layers.length, 4);
	assert.deepEqual(
		state.layers.map((layer) => layer.label),
		['Aluminium sheet 1', 'Aluminium sheet 2', 'Nomex honeycomb', 'Carbon fibre plate'],
	);
	assert.deepEqual(
		state.layers.map((layer) => layer.thicknessMm),
		[1, 1, 5, 2],
	);
	assert.equal(state.layers[0].materialId, 'aluminium');
	assert.equal(state.layers[1].materialId, 'aluminium');
	assert.equal(state.layers[2].materialId, 'nomex');
	assert.equal(state.layers[3].materialId, 'carbon-fibre');
	assert.equal(state.layers[0].frontSurface.finish, 'foil');
	assert.equal(state.layers[1].frontSurface.finish, 'foil');
	assert.equal(state.layers[0].backSurface.finish, 'bare');
	assert.equal(state.layers[1].backSurface.finish, 'bare');
	assert.deepEqual(
		state.interfaces.map((networkInterface) => networkInterface.type),
		['air-gap', 'air-gap', 'adhesive', 'adhesive'],
	);
	assert.equal(state.interfaces[0].gapThicknessMm, 20);
	assert.equal(state.interfaces[1].gapThicknessMm, 20);
	assert.deepEqual(validateNetworkState(state), []);

	const result = solveThermalNetwork(buildNetworkInputs(state));
	assert.equal(result.converged, true);
	assert.equal(result.layers.length, 4);
	closeTo(result.sourceTemperatureC, 800, 1e-12, 'Setup1 source temperature');
	for (let index = 1; index < result.temperatureNodes.length; index += 1) {
		assert.ok(
			result.temperatureNodes[index].temperatureC <=
				result.temperatureNodes[index - 1].temperatureC + 1e-6,
			'node temperatures should decrease toward ambient',
		);
	}
	assert.ok(Number.isFinite(result.heatFluxWm2));
	assert.ok(result.totalResistance > 0);
});

test('surface finishes resolve to bare, foil or custom emissivity', () => {
	assert.equal(resolveSurfaceEmissivity({ finish: 'bare', emissivity: 0.2 }, 0.88, 0.05), 0.88);
	assert.equal(resolveSurfaceEmissivity({ finish: 'foil', emissivity: 0.2 }, 0.88, 0.05), 0.05);
	assert.equal(resolveSurfaceEmissivity({ finish: 'custom', emissivity: 0.31 }, 0.88, 0.05), 0.31);

	const state = createInitialState();
	state.sourceSurface = { finish: 'custom', emissivity: 0.42 };
	state.layers[1].backSurface = { finish: 'foil', emissivity: 0.9 };
	state.foilEmissivity = 0.07;
	const inputs = buildNetworkInputs(state);
	assert.equal(inputs.sourceEmissivity, 0.42);
	assert.equal(inputs.layers[1].backEmissivity, 0.07);
});

test('material presets update a layer without disturbing its surface settings', () => {
	const state = createInitialState();
	const updated = applyMaterialToLayer(
		{
			...state.layers[0],
			frontSurface: { finish: 'custom', emissivity: 0.33 },
			backSurface: { finish: 'foil', emissivity: 0.5 },
		},
		'aluminium',
	);
	assert.equal(updated.label, 'Aluminium');
	assert.equal(updated.materialId, 'aluminium');
	assert.equal(updated.conductivityWmK, 205);
	assert.equal(updated.thicknessMm, 2);
	assert.equal(updated.densityKgM3, 2700);
	assert.equal(updated.specificHeatJkgK, 900);
	assert.equal(updated.frontSurface.finish, 'custom');
	assert.equal(updated.frontSurface.emissivity, 0.33);
	assert.equal(updated.backSurface.finish, 'foil');
});

test('applying a template resets the network but preserves advanced settings', () => {
	const state = createInitialState();
	state.foilEmissivity = 0.09;
	state.toleranceK = 1e-6;
	state.gapConvectionFactor = 1.5;
	const next = applyTemplate(state, getTemplate('source-model')!);
	assert.equal(next.templateId, 'source-model');
	assert.equal(next.layers.length, 1);
	assert.equal(next.foilEmissivity, 0.09);
	assert.equal(next.toleranceK, 1e-6);
	assert.equal(next.gapConvectionFactor, 1.5);
	assert.notEqual(next.layers[0].id, state.layers[0].id);
});

test('UI validation reports the exact editable paths', () => {
	const cases: Array<[(state: ReturnType<typeof createInitialState>) => void, string]> = [
		[(state) => { state.sourceTemperatureC = 20; }, 'sourceTemperatureC'],
		[(state) => { state.sourceSurface = { finish: 'custom', emissivity: 0 }; }, 'sourceSurface.emissivity'],
		[(state) => { state.layers[0].thicknessMm = 0; }, 'layers.0.thicknessMm'],
		[(state) => { state.layers[0].conductivityWmK = 0; }, 'layers.0.conductivityWmK'],
		[
			(state) => { state.layers[0].frontSurface = { finish: 'custom', emissivity: 0 }; },
			'layers.0.frontSurface.emissivity',
		],
		[
			(state) => { state.layers[0].backSurface = { finish: 'custom', emissivity: 1.2 }; },
			'layers.0.backSurface.emissivity',
		],
		[(state) => { state.interfaces[0].gapThicknessMm = 0; }, 'interfaces.0.gapThicknessMm'],
		[
			(state) => {
				state.interfaces[0].dissipationWm2 = -1;
			},
			'interfaces.0.dissipationWm2',
		],
		[
			(state) => {
				state.interfaces[0] = createInterface('adhesive', { adhesiveThicknessMm: 0 });
			},
			'interfaces.0.adhesiveThicknessMm',
		],
		[
			(state) => {
				state.interfaces[0] = createInterface('adhesive', { adhesiveConductivityWmK: 0 });
			},
			'interfaces.0.adhesiveConductivityWmK',
		],
		[
			(state) => {
				state.interfaces[0] = createInterface('contact', { contactResistanceM2KW: -1 });
			},
			'interfaces.0.contactResistanceM2KW',
		],
		[(state) => { state.backConvectionWm2K = 0; }, 'backConvectionWm2K'],
		[(state) => { state.foilEmissivity = 0; }, 'foilEmissivity'],
		[(state) => { state.airFitIntercept = 0; }, 'airFitIntercept'],
		[(state) => { state.airFitSlope = -1e-5; }, 'airFitSlope'],
		[(state) => { state.gapConvectionFactor = 0; }, 'gapConvectionFactor'],
		[(state) => { state.toleranceK = 0; }, 'toleranceK'],
		[(state) => { state.maxIterations = 0; }, 'maxIterations'],
		[(state) => { state.relaxation = 0; }, 'relaxation'],
	];

	for (const [mutate, path] of cases) {
		const state = createInitialState();
		mutate(state);
		const issues = validateNetworkState(state);
		assert.ok(
			issues.some((issue) => issue.path === path),
			`expected an issue for ${path}`,
		);
	}

	const noLayers = createInitialState();
	noLayers.layers = [];
	noLayers.interfaces = [];
	assert.ok(validateNetworkState(noLayers).some((issue) => issue.path === 'layers'));

	const mismatched = createInitialState();
	mismatched.interfaces = mismatched.interfaces.slice(0, 1);
	assert.ok(validateNetworkState(mismatched).some((issue) => issue.path === 'interfaces'));
});

test('transient UI validation checks time settings and thermal mass', () => {
	const base = createInitialState();
	base.modelMode = 'transient';
	assert.deepEqual(validateNetworkState(base), []);

	const cases: Array<[(state: ReturnType<typeof createInitialState>) => void, string]> = [
		[(state) => { state.timeStepS = 0; }, 'timeStepS'],
		[(state) => { state.finalTimeS = 0; }, 'finalTimeS'],
		[(state) => { state.initialTemperatureC = -300; }, 'initialTemperatureC'],
		[(state) => { state.timeStepS = 0.0001; state.finalTimeS = 60; }, 'finalTimeS'],
		[(state) => { state.layers[0].densityKgM3 = 0; }, 'layers.0.densityKgM3'],
		[(state) => { state.layers[0].specificHeatJkgK = 0; }, 'layers.0.specificHeatJkgK'],
	];

	for (const [mutate, path] of cases) {
		const state = createInitialState();
		state.modelMode = 'transient';
		mutate(state);
		assert.ok(
			validateNetworkState(state).some((issue) => issue.path === path),
			`expected a transient issue for ${path}`,
		);
	}

	const steady = createInitialState();
	steady.timeStepS = 0;
	steady.layers[0].densityKgM3 = 0;
	assert.deepEqual(validateNetworkState(steady), []);

	const transient = createInitialState();
	transient.modelMode = 'transient';
	transient.toleranceK = 0;
	transient.maxIterations = 0;
	transient.relaxation = 0;
	assert.deepEqual(validateNetworkState(transient), []);
});
