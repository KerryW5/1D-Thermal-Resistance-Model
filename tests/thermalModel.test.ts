import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DEFAULT_INPUTS,
	airConductivityK,
	effectiveGapEmissivity,
	solveThermalModel,
	validateInputs,
	type ThermalModelInputs,
} from '../src/lib/thermalModel.ts';

function inputs(overrides: Partial<ThermalModelInputs> = {}): ThermalModelInputs {
	return { ...DEFAULT_INPUTS, ...overrides };
}

function closeTo(actual: number, expected: number, tolerance: number, label: string): void {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`${label}: expected ${expected}, received ${actual}`,
	);
}

test('default inputs match the Python reference solution', () => {
	const result = solveThermalModel(DEFAULT_INPUTS);

	assert.equal(result.iterations, 24);
	assert.equal(result.converged, true);
	assert.ok(result.errorK <= DEFAULT_INPUTS.toleranceK);
	closeTo(result.heatFluxWm2, 2103.353891975971, 1e-6, 'heat flux');
	closeTo(result.frontTemperatureC, 173.38541095963387, 1e-9, 'front temperature');
	closeTo(result.backTemperatureC, 165.49780284271816, 1e-9, 'back temperature');
	closeTo(result.gapResistance, 0.20282589891076877, 1e-12, 'gap resistance');
	closeTo(result.plateResistance, 0.00375, 1e-12, 'plate resistance');
	closeTo(result.backResistance, 0.06441986750518149, 1e-12, 'back resistance');
	closeTo(result.totalResistance, 0.27099576641595025, 1e-12, 'total resistance');
	closeTo(result.effectiveGapEmissivity, 0.049723756906077346, 1e-12, 'effective emissivity');
	assert.equal(result.airFitOutOfRange, false);
});

test('node temperatures and resistances satisfy the network equations', () => {
	const result = solveThermalModel(DEFAULT_INPUTS);
	const hotK = DEFAULT_INPUTS.hotTemperatureC + 273.15;
	const ambientK = DEFAULT_INPUTS.ambientTemperatureC + 273.15;

	closeTo(
		result.gapResistance,
		1 /
			(1 / result.gapConductionResistance + 1 / result.gapRadiationResistance),
		1e-12,
		'gap parallel resistance',
	);
	closeTo(
		result.backResistance,
		1 /
			(1 / result.backConvectionResistance + 1 / result.backRadiationResistance),
		1e-12,
		'back parallel resistance',
	);
	closeTo(
		result.totalResistance,
		result.gapResistance + result.plateResistance + result.backResistance,
		1e-12,
		'total resistance sum',
	);
	closeTo(result.heatFluxWm2, (hotK - ambientK) / result.totalResistance, 1e-9, 'flux equation');

	closeTo(
		result.frontTemperatureC + 273.15,
		hotK - result.heatFluxWm2 * result.gapResistance,
		1e-3,
		'gap temperature drop',
	);
	closeTo(
		result.frontTemperatureC - result.backTemperatureC,
		result.heatFluxWm2 * result.plateResistance,
		1e-3,
		'plate temperature drop',
	);
	closeTo(
		result.backTemperatureC + 273.15,
		ambientK + result.heatFluxWm2 * result.backResistance,
		1e-3,
		'back temperature drop',
	);
});

test('air conductivity and effective emissivity match the source correlations', () => {
	closeTo(
		airConductivityK(300, DEFAULT_INPUTS.airFitIntercept, DEFAULT_INPUTS.airFitSlope),
		0.02636745,
		1e-12,
		'air conductivity at 300 K',
	);
	closeTo(effectiveGapEmissivity(0.9, 0.05), 0.049723756906077346, 1e-12, 'emissivity');
});

test('validation accepts the defaults and rejects invalid values', () => {
	assert.deepEqual(validateInputs(DEFAULT_INPUTS), []);

	const cases: Array<[Partial<ThermalModelInputs>, keyof ThermalModelInputs]> = [
		[{ hotTemperatureC: Number.NaN }, 'hotTemperatureC'],
		[{ hotTemperatureC: 20 }, 'hotTemperatureC'],
		[{ ambientTemperatureC: 600 }, 'hotTemperatureC'],
		[{ ambientTemperatureC: -300 }, 'ambientTemperatureC'],
		[{ gapThicknessM: 0 }, 'gapThicknessM'],
		[{ plateThicknessM: -0.001 }, 'plateThicknessM'],
		[{ plateConductivityWmK: 0 }, 'plateConductivityWmK'],
		[{ sourceEmissivity: 0 }, 'sourceEmissivity'],
		[{ foilEmissivity: 1.1 }, 'foilEmissivity'],
		[{ backEmissivity: 0 }, 'backEmissivity'],
		[{ backConvectionWm2K: 0 }, 'backConvectionWm2K'],
		[{ airFitIntercept: 0 }, 'airFitIntercept'],
		[{ airFitSlope: -1e-5 }, 'airFitSlope'],
		[{ toleranceK: 0 }, 'toleranceK'],
		[{ maxIterations: 0 }, 'maxIterations'],
		[{ maxIterations: 1.5 }, 'maxIterations'],
		[{ relaxation: 0 }, 'relaxation'],
		[{ relaxation: 1.1 }, 'relaxation'],
	];

	for (const [overrides, field] of cases) {
		const issues = validateInputs(inputs(overrides));
		assert.ok(
			issues.some((issue) => issue.field === field),
			`expected an issue for ${field}`,
		);
	}
});

test('the solver refuses invalid inputs and reports non-convergence', () => {
	assert.throws(() => solveThermalModel(inputs({ gapThicknessM: 0 })));

	const limited = solveThermalModel(inputs({ maxIterations: 1 }));
	assert.equal(limited.converged, false);
	assert.equal(limited.iterations, 1);
	assert.ok(Number.isFinite(limited.heatFluxWm2));
	assert.ok(Number.isFinite(limited.frontTemperatureC));
	assert.ok(Number.isFinite(limited.backTemperatureC));
});

test('physical trends respond in the expected direction', () => {
	const baseline = solveThermalModel(DEFAULT_INPUTS);
	const widerGap = solveThermalModel(inputs({ gapThicknessM: 0.08 }));
	const hotterSource = solveThermalModel(inputs({ hotTemperatureC: 650 }));
	const reflectiveChange = solveThermalModel(inputs({ foilEmissivity: 0.9 }));

	assert.ok(widerGap.gapResistance > baseline.gapResistance);
	assert.ok(widerGap.heatFluxWm2 < baseline.heatFluxWm2);
	assert.ok(hotterSource.heatFluxWm2 > baseline.heatFluxWm2);
	assert.ok(reflectiveChange.gapRadiationResistance < baseline.gapRadiationResistance);
	assert.ok(reflectiveChange.heatFluxWm2 > baseline.heatFluxWm2);
});

test('a large tolerance still produces a valid converged state', () => {
	const result = solveThermalModel(inputs({ toleranceK: 5 }));
	assert.ok(result.iterations >= 1);
	assert.equal(result.converged, true);
	assert.ok(result.errorK <= 5);
	assert.ok(Number.isFinite(result.heatFluxWm2));
	assert.ok(result.totalResistance > 0);
});
