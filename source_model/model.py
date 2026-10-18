import math

class ThermalNetworkModel:
    def __init__(self):
        # --- System Boundary Conditions ---
        self.T_hot_C = 600.0          # Heat source temp (Celsius)
        self.T_inf_C = 30.0           # Ambient room temp (Celsius)
        
        # --- Geometry & Dimensions (m) ---
        self.L_gap = 0.040            # 40 mm air gap
        self.L_plate = 0.003          # 3 mm composite plate
        
        # --- Optical & Radiative Properties ---
        self.sigma = 5.67e-8          # Stefan-Boltzmann constant (W/m^2.K^4)
        self.eps_1 = 0.90             # Source surface emissivity
        self.eps_foil = 0.05          # Reflective foil emissivity
        self.eps_back = 0.88          # Composite back surface emissivity
        
        # Calculate effective gap emissivity (Infinite parallel plates)
        self.eps_eff_gap = 1.0 / (1.0/self.eps_1 + 1.0/self.eps_foil - 1.0)
        
        # --- Thermal Properties ---
        self.k_plate = 0.8            # Composite conductivity (W/m.K)
        self.h_back_conv = 5.0        # Back surface natural convection (W/m^2.K)

    def k_air(self, T_kelvin):
        """
        Calculates temperature-dependent thermal conductivity of air.
        Using a standard linear approximation for atmospheric air between 300K and 900K.
        """
        T_celsius = T_kelvin - 273.15
        return 0.0243 + (7.7e-5 * T_celsius)

    def solve(self, tolerance=1e-4, max_iter=1000):
        """
        Iteratively solves the non-linear thermal resistance network.
        """
        # Convert fixed boundaries to Kelvin
        T_hot = self.T_hot_C + 273.15
        T_inf = self.T_inf_C + 273.15
        
        # Initial guesses for unknown node temperatures (in Kelvin)
        T1 = T_hot - 100.0   # Node 1: Foil face
        T2 = T_inf + 100.0   # Node 2: Back face
        
        iteration = 0
        error = 1.0
        
        # Damping factor to prevent oscillation during radiation convergence
        relaxation = 0.5 

        while error > tolerance and iteration < max_iter:
            T1_old = T1
            T2_old = T2
            
            # ---------------------------------------------------------
            # 1. Calculate Thermal Resistances (R'' in m^2.K/W)
            # ---------------------------------------------------------
            
            # A. Air Gap
            T_mean_gap = (T_hot + T1) / 2.0
            R_gap_cond = self.L_gap / self.k_air(T_mean_gap)
            
            h_gap_rad = self.sigma * self.eps_eff_gap * (T_hot**2 + T1**2) * (T_hot + T1)
            R_gap_rad = 1.0 / h_gap_rad if h_gap_rad > 0 else float('inf')
            
            R_eq_gap = 1.0 / (1.0/R_gap_cond + 1.0/R_gap_rad)
            
            # B. Composite Plate (Conduction only)
            R_plate = self.L_plate / self.k_plate
            
            # C. Back Surface
            R_back_conv = 1.0 / self.h_back_conv
            
            h_back_rad = self.sigma * self.eps_back * (T2**2 + T_inf**2) * (T2 + T_inf)
            R_back_rad = 1.0 / h_back_rad if h_back_rad > 0 else float('inf')
            
            R_eq_back = 1.0 / (1.0/R_back_conv + 1.0/R_back_rad)
            
            # ---------------------------------------------------------
            # 2. Total Heat Flux & Temperature Updates
            # ---------------------------------------------------------
            
            # Total equivalent resistance
            R_total = R_eq_gap + R_plate + R_eq_back
            
            # 1D Heat Flux (W/m^2)
            q_flux = (T_hot - T_inf) / R_total
            
            # Calculate new temperatures based on voltage-drop analogy
            T1_new = T_hot - (q_flux * R_eq_gap)
            T2_new = T1_new - (q_flux * R_plate)
            
            # Apply relaxation to update temperatures smoothly
            T1 = (relaxation * T1_new) + ((1 - relaxation) * T1_old)
            T2 = (relaxation * T2_new) + ((1 - relaxation) * T2_old)
            
            # Calculate maximum error for convergence check
            error = max(abs(T1 - T1_old), abs(T2 - T2_old))
            iteration += 1

        if iteration >= max_iter:
            print("Warning: Solver hit max iterations without converging.")

        return {
            "iterations": iteration,
            "q_flux_W_m2": q_flux,
            "T1_C": T1 - 273.15,
            "T2_C": T2 - 273.15,
            "R_eq_gap": R_eq_gap,
            "R_plate": R_plate,
            "R_eq_back": R_eq_back
        }

# --- Execution Example ---
if __name__ == "__main__":
    model = ThermalNetworkModel()
    results = model.solve()
    
    print("=== Steady-State 1D Thermal Model Results ===")
    print(f"Convergence reached in {results['iterations']} iterations.")
    print(f"Total Heat Flux (q''):  {results['q_flux_W_m2']:.2f} W/m^2")
    print(f"Front Surface Temp (T1): {results['T1_C']:.2f} °C")
    print(f"Back Surface Temp (T2):  {results['T2_C']:.2f} °C")
    print("\n--- Thermal Resistances (m^2.K/W) ---")
    print(f"Air Gap (Parallel):      {results['R_eq_gap']:.4f}")
    print(f"Composite Plate:         {results['R_plate']:.4f}")
    print(f"Back Surface (Parallel): {results['R_eq_back']:.4f}")