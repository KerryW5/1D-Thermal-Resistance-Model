export const STEFAN_BOLTZMANN = 5.67e-8;
export const KELVIN_OFFSET = 273.15;
export const ABSOLUTE_ZERO_C = -273.15;

export interface ThermalModelInputs {
	hotTemperatureC: number;
	ambientTemperatureC: number;
	gapThicknessM: number;
	plateThicknessM: number;
	plateConductivityWmK: number;
	sourceEmissivity: number;
	foilEmissivity: number;
	backEmissivity: number;
	backConvectionWm2K: number;
	airFitIntercept: number;
	airFitSlope: number;
	toleranceK: number;
	maxIterations: number;
	relaxation: number;
}

export interface ThermalModelResult {
	iterations: number;
	converged: boolean;
	errorK: number;
	heatFluxWm2: number;
	frontTemperatureC: number;
	backTemperatureC: number;
	effectiveGapEmissivity: number;
	gapMeanTemperatureK: number;
	airConductivityWmK: number;
	gapConductionResistance: number;
	gapRadiationCoefficient: number;
	gapRadiationResistance: number;
	gapResistance: number;
	plateResistance: number;
	backConvectionResistance: number;
	backRadiationCoefficient: number;
	backRadiationResistance: number;
	backResistance: number;
	totalResistance: number;
	airFitOutOfRange: boolean;
}

export interface ValidationIssue {
	field: keyof ThermalModelInputs;
	message: string;
}

export const DEFAULT_INPUTS: ThermalModelInputs = {
	hotTemperatureC: 600,
	ambientTemperatureC: 30,
	gapThicknessM: 0.04,
	plateThicknessM: 0.003,
	plateConductivityWmK: 0.8,
	sourceEmissivity: 0.9,
	foilEmissivity: 0.05,
	backEmissivity: 0.88,
	backConvectionWm2K: 5,
	airFitIntercept: 0.0243,
	airFitSlope: 7.7e-5,
	toleranceK: 1e-4,
	maxIterations: 1000,
	relaxation: 0.5,
};

interface IterationState {
	heatFluxWm2: number;
	gapMeanK: number;
	conductivity: number;
	gapConductionResistance: number;
	gapRadiationCoefficient: number;
	gapRadiationResistance: number;
	gapResistance: number;
	plateResistance: number;
	backConvectionResistance: number;
	backRadiationCoefficient: number;
	backRadiationResistance: number;
	backResistance: number;
	totalResistance: number;
}

interface NumberField {
	field: keyof ThermalModelInputs;
	label: string;
}

const NUMBER_FIELDS: NumberField[] = [
	{ field: 'hotTemperatureC', label: 'Heat source temperature' },
	{ field: 'ambientTemperatureC', label: 'Ambient temperature' },
	{ field: 'gapThicknessM', label: 'Air gap thickness' },
	{ field: 'plateThicknessM', label: 'Plate thickness' },
	{ field: 'plateConductivityWmK', label: 'Plate conductivity' },
	{ field: 'sourceEmissivity', label: 'Source emissivity' },
	{ field: 'foilEmissivity', label: 'Foil emissivity' },
	{ field: 'backEmissivity', label: 'Back-surface emissivity' },
	{ field: 'backConvectionWm2K', label: 'Back-surface convection coefficient' },
	{ field: 'airFitIntercept', label: 'Air-fit intercept' },
	{ field: 'airFitSlope', label: 'Air-fit slope' },
	{ field: 'toleranceK', label: 'Convergence tolerance' },
	{ field: 'maxIterations', label: 'Maximum iterations' },
	{ field: 'relaxation', label: 'Relaxation factor' },
];

function finite(inputs: ThermalModelInputs, field: keyof ThermalModelInputs): boolean {
	return Number.isFinite(inputs[field]);
}

function validEmissivity(value: number): boolean {
	return value > 0 && value <= 1;
}

export class ThermalModelError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ThermalModelError';
	}
}

export function effectiveGapEmissivity(sourceEmissivity: number, foilEmissivity: number): number {
	return 1 / (1 / sourceEmissivity + 1 / foilEmissivity - 1);
}

export function airConductivityK(
	temperatureK: number,
	intercept: number,
	slope: number,
): number {
	return intercept + slope * (temperatureK - KELVIN_OFFSET);
}

export function validateInputs(inputs: ThermalModelInputs): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	for (const { field, label } of NUMBER_FIELDS) {
		if (!finite(inputs, field)) {
			issues.push({ field, message: `${label} must be a number.` });
		}
	}

	if (finite(inputs, 'hotTemperatureC') && inputs.hotTemperatureC <= ABSOLUTE_ZERO_C) {
		issues.push({ field: 'hotTemperatureC', message: 'Heat source temperature must be above absolute zero.' });
	}

	if (finite(inputs, 'ambientTemperatureC') && inputs.ambientTemperatureC <= ABSOLUTE_ZERO_C) {
		issues.push({ field: 'ambientTemperatureC', message: 'Ambient temperature must be above absolute zero.' });
	}

	if (
		finite(inputs, 'hotTemperatureC') &&
		finite(inputs, 'ambientTemperatureC') &&
		inputs.hotTemperatureC > ABSOLUTE_ZERO_C &&
		inputs.ambientTemperatureC > ABSOLUTE_ZERO_C &&
		inputs.hotTemperatureC <= inputs.ambientTemperatureC
	) {
		issues.push({
			field: 'hotTemperatureC',
			message: 'Heat source temperature must be greater than ambient temperature.',
		});
	}

	if (finite(inputs, 'gapThicknessM') && inputs.gapThicknessM <= 0) {
		issues.push({ field: 'gapThicknessM', message: 'Air gap thickness must be greater than zero.' });
	}

	if (finite(inputs, 'plateThicknessM') && inputs.plateThicknessM <= 0) {
		issues.push({ field: 'plateThicknessM', message: 'Plate thickness must be greater than zero.' });
	}

	if (finite(inputs, 'plateConductivityWmK') && inputs.plateConductivityWmK <= 0) {
		issues.push({ field: 'plateConductivityWmK', message: 'Plate conductivity must be greater than zero.' });
	}

	if (finite(inputs, 'sourceEmissivity') && !validEmissivity(inputs.sourceEmissivity)) {
		issues.push({ field: 'sourceEmissivity', message: 'Emissivity must be greater than 0 and at most 1.' });
	}

	if (finite(inputs, 'foilEmissivity') && !validEmissivity(inputs.foilEmissivity)) {
		issues.push({ field: 'foilEmissivity', message: 'Emissivity must be greater than 0 and at most 1.' });
	}

	if (finite(inputs, 'backEmissivity') && !validEmissivity(inputs.backEmissivity)) {
		issues.push({ field: 'backEmissivity', message: 'Emissivity must be greater than 0 and at most 1.' });
	}

	if (finite(inputs, 'backConvectionWm2K') && inputs.backConvectionWm2K <= 0) {
		issues.push({
			field: 'backConvectionWm2K',
			message: 'Back-surface convection coefficient must be greater than zero.',
		});
	}

	if (finite(inputs, 'airFitIntercept') && inputs.airFitIntercept <= 0) {
		issues.push({ field: 'airFitIntercept', message: 'Air-fit intercept must be greater than zero.' });
	}

	if (finite(inputs, 'airFitSlope') && inputs.airFitSlope < 0) {
		issues.push({ field: 'airFitSlope', message: 'Air-fit slope cannot be negative.' });
	}

	if (finite(inputs, 'toleranceK') && inputs.toleranceK <= 0) {
		issues.push({ field: 'toleranceK', message: 'Convergence tolerance must be greater than zero.' });
	}

	if (finite(inputs, 'maxIterations')) {
		if (!Number.isInteger(inputs.maxIterations) || inputs.maxIterations < 1) {
			issues.push({ field: 'maxIterations', message: 'Maximum iterations must be a whole number of at least 1.' });
		} else if (inputs.maxIterations > 100000) {
			issues.push({ field: 'maxIterations', message: 'Maximum iterations cannot exceed 100000.' });
		}
	}

	if (finite(inputs, 'relaxation') && (inputs.relaxation <= 0 || inputs.relaxation > 1)) {
		issues.push({ field: 'relaxation', message: 'Relaxation factor must be greater than 0 and at most 1.' });
	}

	return issues;
}

function parallelResistance(first: number, second: number): number {
	return 1 / (1 / first + 1 / second);
}

export function solveThermalModel(inputs: ThermalModelInputs): ThermalModelResult {
	const issues = validateInputs(inputs);
	if (issues.length > 0) {
		throw new ThermalModelError(issues.map((issue) => issue.message).join(' '));
	}

	const hotK = inputs.hotTemperatureC + KELVIN_OFFSET;
	const ambientK = inputs.ambientTemperatureC + KELVIN_OFFSET;
	const gapEmissivity = effectiveGapEmissivity(inputs.sourceEmissivity, inputs.foilEmissivity);

	let frontK = hotK - 100;
	let backK = ambientK + 100;
	let iteration = 0;
	let errorK = Number.POSITIVE_INFINITY;
	let state: IterationState | null = null;

	while (errorK > inputs.toleranceK && iteration < inputs.maxIterations) {
		const previousFrontK = frontK;
		const previousBackK = backK;

		const gapMeanK = (hotK + frontK) / 2;
		const conductivity = airConductivityK(gapMeanK, inputs.airFitIntercept, inputs.airFitSlope);

		if (!Number.isFinite(conductivity) || conductivity <= 0) {
			throw new ThermalModelError(
				'Air conductivity is not positive at the gap mean temperature. Adjust the air-fit constants or temperatures.',
			);
		}

		const gapConductionResistance = inputs.gapThicknessM / conductivity;
		const gapRadiationCoefficient =
			STEFAN_BOLTZMANN *
			gapEmissivity *
			(hotK * hotK + frontK * frontK) *
			(hotK + frontK);
		const gapRadiationResistance =
			gapRadiationCoefficient > 0 ? 1 / gapRadiationCoefficient : Number.POSITIVE_INFINITY;
		const gapResistance = parallelResistance(gapConductionResistance, gapRadiationResistance);

		const plateResistance = inputs.plateThicknessM / inputs.plateConductivityWmK;
		const backConvectionResistance = 1 / inputs.backConvectionWm2K;
		const backRadiationCoefficient =
			STEFAN_BOLTZMANN *
			inputs.backEmissivity *
			(backK * backK + ambientK * ambientK) *
			(backK + ambientK);
		const backRadiationResistance =
			backRadiationCoefficient > 0 ? 1 / backRadiationCoefficient : Number.POSITIVE_INFINITY;
		const backResistance = parallelResistance(backConvectionResistance, backRadiationResistance);

		const totalResistance = gapResistance + plateResistance + backResistance;
		const heatFluxWm2 = (hotK - ambientK) / totalResistance;

		const nextFrontK = hotK - heatFluxWm2 * gapResistance;
		const nextBackK = nextFrontK - heatFluxWm2 * plateResistance;

		frontK =
			inputs.relaxation * nextFrontK + (1 - inputs.relaxation) * previousFrontK;
		backK = inputs.relaxation * nextBackK + (1 - inputs.relaxation) * previousBackK;
		errorK = Math.max(Math.abs(frontK - previousFrontK), Math.abs(backK - previousBackK));
		iteration += 1;

		state = {
			heatFluxWm2,
			gapMeanK,
			conductivity,
			gapConductionResistance,
			gapRadiationCoefficient,
			gapRadiationResistance,
			gapResistance,
			plateResistance,
			backConvectionResistance,
			backRadiationCoefficient,
			backRadiationResistance,
			backResistance,
			totalResistance,
		};
	}

	if (!state) {
		throw new ThermalModelError('The solver did not produce a result.');
	}

	const converged = Number.isFinite(errorK) && errorK <= inputs.toleranceK;

	return {
		iterations: iteration,
		converged,
		errorK,
		heatFluxWm2: state.heatFluxWm2,
		frontTemperatureC: frontK - KELVIN_OFFSET,
		backTemperatureC: backK - KELVIN_OFFSET,
		effectiveGapEmissivity: gapEmissivity,
		gapMeanTemperatureK: state.gapMeanK,
		airConductivityWmK: state.conductivity,
		gapConductionResistance: state.gapConductionResistance,
		gapRadiationCoefficient: state.gapRadiationCoefficient,
		gapRadiationResistance: state.gapRadiationResistance,
		gapResistance: state.gapResistance,
		plateResistance: state.plateResistance,
		backConvectionResistance: state.backConvectionResistance,
		backRadiationCoefficient: state.backRadiationCoefficient,
		backRadiationResistance: state.backRadiationResistance,
		backResistance: state.backResistance,
		totalResistance: state.totalResistance,
		airFitOutOfRange: state.gapMeanK < 300 || state.gapMeanK > 900,
	};
}
