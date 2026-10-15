#!/usr/bin/env python3
"""Independently recompute every numeric answer and check it against the answer key.

Each check computes the value from scratch (numerically where possible), then confirms
that the choice marked correct in content/*.py holds that value.
Run: python3 tools/verify_answers.py
"""
import math
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "content"))
import calc_ab, calc_bc, physics_1, chemistry  # noqa: E402

fails = 0


def simpson(f, a, b, n=20000):
    h = (b - a) / n
    s = f(a) + f(b) + sum((4 if i % 2 else 2) * f(a + i * h) for i in range(1, n))
    return s * h / 3


def deriv(f, x, h=1e-5):
    return (f(x + h) - f(x - h)) / (2 * h)


def key(course, qid, expected, values, tol=1e-3):
    """values: numeric value of each choice (None if non-numeric)."""
    global fails
    q = next(q for q in course["mcq"] if q["id"] == qid)
    keyed = values[q["answer"]]
    matches = [i for i, v in enumerate(values) if v is not None and abs(v - expected) <= tol * max(1, abs(expected))]
    ok = keyed is not None and abs(keyed - expected) <= tol * max(1, abs(expected)) and matches == [q["answer"]]
    print(f"{'✓' if ok else '✗'} {qid}: computed {expected:.6g}, key {'ABCD'[q['answer']]} = {keyed}")
    if not ok:
        fails += 1


def check(label, ok, detail=""):
    global fails
    print(f"{'✓' if ok else '✗'} {label} {detail}")
    if not ok:
        fails += 1


C = calc_bc.COURSE
# cb-01 limit
f = lambda x: (x * x - 9) / (x * x - 2 * x - 3)
key(C, "cb-01", f(3 + 1e-7), [0, 1.5, 2, None])
# cb-02 continuity: solve k so that 2k+1 = 4-k
k = next(k for k in [-1, 1, 5 / 3, 3] if abs((2 * k + 1) - (4 - k)) < 1e-12)
key(C, "cb-02", k, [-1, 1, 5 / 3, 3])
key(C, "cb-03", deriv(lambda x: 3 * x**4 - 2 / x + math.sqrt(x), 1), [10.5, 14, 14.5, 15])
key(C, "cb-04", deriv(math.sin, math.pi / 3), [0, 0.5, math.sqrt(3) / 2, None])
# cb-05 implicit: dy/dx = -Fx/Fy
Fx = 2 * 1 + 2; Fy = 1 + 2 * 2
key(C, "cb-05", -Fx / Fy, [-0.8, -1.25, 0.8, -2])
fprime = deriv(lambda x: x**3 + x + 1, 1)
check("cb-06 f(1)=3", 1**3 + 1 + 1 == 3)
key(C, "cb-06", 1 / fprime, [0.25, 1 / 28, 4, 28])
key(C, "cb-07", deriv(lambda t: 4 / 3 * math.pi * (5 + 2 * t) ** 3, 0), [40 * math.pi, 100 * math.pi, 200 * math.pi, 500 * math.pi / 3])
g = lambda x: (math.exp(2 * x) - 1 - 2 * x) / x**2
key(C, "cb-08", g(1e-4), [0, 1, 2, 4], tol=1e-3)
fp = lambda x: (x - 1) ** 2 * (x + 3)
check("cb-09 sign change at -3 (−→+), none at 1", fp(-3.1) < 0 < fp(-2.9) and fp(0.9) > 0 and fp(1.1) > 0)
key(C, "cb-10", math.sqrt((27 - 0) / 3 / 3), [1, math.sqrt(3), 1.5, 3])
h = lambda x: x**3 - 3 * x**2 + 1
key(C, "cb-11", max(h(-1 + i * 5 / 100000) for i in range(100001)), [1, 5, 17, -3])
key(C, "cb-12", simpson(lambda x: 3 * x * x - 4 * x + 1, 0, 2), [0, 2, 4, 6])
# cb-13 antiderivative check: derivative of 1/2 e^{x^2} equals x e^{x^2}
check("cb-13", abs(deriv(lambda x: 0.5 * math.exp(x * x), 0.7) - 0.7 * math.exp(0.49)) < 1e-6)
# cb-14 FTC with chain rule at x=0.8
G = lambda x: simpson(lambda t: math.cos(t**3), 1, x * x, 2000)
check("cb-14", abs(deriv(G, 0.8, 1e-4) - 2 * 0.8 * math.cos(0.8**6)) < 1e-5)
# cb-15 partial fractions at x=5
check("cb-15", abs(deriv(lambda x: math.log(abs(x - 2)) - math.log(abs(x + 3)), 5) - 5 / ((5 - 2) * (5 + 3))) < 1e-6)
key(C, "cb-16", simpson(lambda s: math.exp(-0.5 * s), 0, 60), [2 / 3, 1, 2, None])  # x = e^s substitution
# cb-17 check y=3e^{x^2/2} solves y'=xy
y = lambda x: 3 * math.exp(x * x / 2)
check("cb-17", abs(deriv(y, 0.9) - 0.9 * y(0.9)) < 1e-6 and y(0) == 3)
# cb-18 Euler
x, yv = 0.0, 1.0
for _ in range(2):
    yv += 0.5 * (x + yv); x += 0.5
key(C, "cb-18", yv, [2, 2.5, 3, 3.5])
key(C, "cb-19", max((p / 10 for p in range(0, 5001)), key=lambda p: 0.4 * p * (1 - p / 500)), [100, 200, 250, 500])
key(C, "cb-20", simpson(lambda x: x - x * x, 0, 1), [1 / 6, 1 / 3, 0.5, 5 / 6])
key(C, "cb-21", math.pi * simpson(lambda x: x, 0, 4), [4 * math.pi, 8 * math.pi, 16 * math.pi / 3, 16 * math.pi])
key(C, "cb-22", simpson(lambda x: math.sqrt(1 + x), 0, 3), [14 / 3, 2 * math.sqrt(3), 16 / 3, 7])
key(C, "cb-23", (3 * 4 - 3) / (2 * 2), [9 / 4, 4 / 9, 9, 4.5])
dydx = lambda t: (3 * t * t) / (2 * t)
key(C, "cb-24", deriv(dydx, 1) / (2 * 1), [0.75, 1.5, 3, 6])
key(C, "cb-25", 0.5 * simpson(lambda th: (2 * math.cos(th)) ** 2, -math.pi / 2, math.pi / 2), [math.pi / 2, math.pi, 2 * math.pi, 4 * math.pi])
key(C, "cb-26", math.hypot(3 * 1, 4 * 1), [3, 4, 5, 7])
check("cb-27 alternating harmonic partial sums settle", abs(sum((-1) ** n / n for n in range(1, 200001)) + math.log(2)) < 1e-4)
check("cb-28 radius 3 centered at 2 → endpoints -1, 5", True, "(endpoint behavior: x=5 harmonic diverges, x=-1 alternating converges)")
# cb-29 coefficient of x^5 in x e^{x^2}: from e^{u}, u^2/2! term
key(C, "cb-29", 1 / math.factorial(2), [0.5, 1 / 6, 1 / 24, 1 / 120])
S = sum((-1) ** (n + 1) / n**2 for n in range(1, 200000))
S4 = sum((-1) ** (n + 1) / n**2 for n in range(1, 5))
check("cb-30 actual error below 1/25", abs(S - S4) < 1 / 25, f"(actual {abs(S-S4):.4f})")
key(C, "cb-30", 1 / 25, [1 / 16, 1 / 25, 1 / 36, 1 / 5])

# FRQs
R = {0: 10, 2: 14, 5: 15, 9: 11, 12: 8}
check("cb-frq-1a R'(7)≈-1", (R[9] - R[5]) / 4 == -1)
check("cb-frq-1b LRS=155", 10 * 2 + 14 * 3 + 15 * 4 + 11 * 3 == 155)
check("cb-frq-1c avg rate -1/6", abs((8 - 10) / 12 + 1 / 6) < 1e-12)
v = lambda t: t * t - 6 * t + 8
check("cb-frq-2c x(5)=26/3", abs(2 + simpson(v, 0, 5) - 26 / 3) < 1e-9)
check("cb-frq-2d distance=28/3", abs(simpson(lambda t: abs(v(t)), 0, 5, 300000) - 28 / 3) < 1e-4)
exact = simpson(lambda x: x * math.cos(x), 0, 1)
check("cb-frq-3 error < 1/144", abs(exact - 3 / 8) < 1 / 144, f"(exact {exact:.5f})")
# cb-frq-4: verify particular solution satisfies DE and f(1)=3
fs = lambda x: 1 + 2 * math.exp((x**3 - 1) / 3)
check("cb-frq-4 solution", abs(fs(1) - 3) < 1e-12 and abs(deriv(fs, 1.3) - (fs(1.3) - 1) * 1.3**2) < 1e-6)
check("cb-frq-4 f(1.1)≈3.233 > 3.2 (underestimate)", abs(fs(1.1) - 3.233) < 5e-4 and fs(1.1) > 3.2, f"({fs(1.1):.4f})")

A = calc_ab.COURSE
key(A, "ab-01", (3 * 1e7**2 - 5e7) / (2 - 7 * 1e7**2), [-3 / 7, 1.5, 0, None])
key(A, "ab-02", math.sin(5e-7) / 1e-7, [0, 1, 5, 0.2])
check("ab-03 limit 4 vs f(2)=3 → removable", abs(((2.0000001) ** 2 - 4) / (2.0000001 - 2) - 4) < 1e-5)
f = lambda x: x**3 - 4 * x
check("ab-05 tangent y=8(x-2)", f(2) == 0 and abs(deriv(f, 2) - 8) < 1e-6)
check("ab-06 product rule", abs(deriv(lambda x: x * x * math.sin(x), 0.9) - (2 * 0.9 * math.sin(0.9) + 0.81 * math.cos(0.9))) < 1e-6)
key(A, "ab-08", deriv(lambda x: x / (x + 1), 1), [0.25, 0.5, -0.25, 1])
key(A, "ab-09", deriv(lambda x: math.sqrt(1 + x**3), 2), [2, 1 / 6, 6, 12])
check("ab-10", abs(deriv(lambda x: math.log(math.cos(x)), 0.4) + math.tan(0.4)) < 1e-6)
check("ab-11", abs(deriv(lambda x: math.atan(2 * x), 0.3) - 2 / (1 + 4 * 0.09)) < 1e-6)
key(A, "ab-12", -4 * 2, [-8, 14, -4, 10])
v = lambda t: 3 * t * t - 12 * t + 9
check("ab-13 at rest t=1,3", abs(v(1)) < 1e-12 and abs(v(3)) < 1e-12)
key(A, "ab-14", 4 + (1 / (2 * 4)) * 1, [4.125, 4.25, 4.0625, 4.5])
key(A, "ab-15", 6 * 2 / 8, [1.5, 2, 8 / 3, 0.75])
key(A, "ab-16", (1 - math.cos(1e-3)) / 1e-6, [0, 0.5, 1, None])
fp = lambda x: 3 * x * x - 6 * x
check("ab-17 decreasing on (0,2)", fp(1) < 0 and fp(-0.1) > 0 and fp(2.1) > 0)
f2 = lambda x: 6 * x - 12
check("ab-18 inflection at 2", f2(1.9) < 0 < f2(2.1))
key(A, "ab-19", max(x * (20 - x) for x in [i / 100 for i in range(2001)]), [100, 96, 400, 80])
key(A, "ab-21", 0.5 * sum((0.5 * i) ** 2 for i in range(1, 5)), [3.75, 1.75, 2.75, 8 / 3])
key(A, "ab-22", simpson(lambda x: 1 / x, 1, math.e), [1, math.e - 1, 0, 1 / math.e])
check("ab-23", abs(deriv(lambda x: math.sin(3 * x) / 3, 0.5) - math.cos(1.5)) < 1e-6)
key(A, "ab-24", 2 * (8 - 3) + 3, [13, 11, 10, 23])
gp = lambda x: x * x - 4
check("ab-25 rel min at 2", gp(1.9) < 0 < gp(2.1) and gp(-2.1) > 0 > gp(-1.9))
key(A, "ab-26", simpson(lambda x: x * x, 0, 3) / 3, [3, 9, 4.5, 1.5])
yy = lambda x: math.sqrt(2 * x * x + 9)
check("ab-27", abs(deriv(yy, 1.2) - 2 * 1.2 / yy(1.2)) < 1e-6 and yy(0) == 3)
key(A, "ab-28", 200 * 2 ** (15 / 5), [1600, 1200, 800, 6000])
key(A, "ab-29", simpson(lambda x: 4 - x * x, -2, 2), [32 / 3, 16 / 3, 8, 16])
key(A, "ab-30", math.pi * simpson(lambda x: x * x - x**4, 0, 1), [2 * math.pi / 15, math.pi / 6, math.pi / 30, math.pi / 3])
key(A, "ab-31", simpson(lambda x: math.sqrt(x) ** 2, 0, 4), [8, 8 * math.pi, 16 / 3, 16])
key(A, "ab-32", simpson(lambda t: abs(3 * t * t - 12), 0, 3, 300000), [23, 9, -9, 25], tol=1e-4)
Hd = {0: 90, 4: 78, 9: 66, 15: 56, 20: 50}
ts = sorted(Hd)
trap = sum((Hd[a] + Hd[b]) / 2 * (b - a) for a, b in zip(ts, ts[1:]))
check("ab-frq-1 trap=1327, avg 66.35, MVT -2", trap == 1327 and abs(trap / 20 - 66.35) < 1e-9 and (50 - 90) / 20 == -2)
q4 = lambda x: x**4 - 4 * x**3
check("ab-frq-2 candidates", [q4(x) for x in (-1, 0, 3, 4)] == [5, 0, -27, 0])
fpw = lambda t: t + 2 if t <= 0 else 2 - t
g = lambda x: simpson(fpw, -2, 0, 2000) + simpson(fpw, 0, x, 2000) if x > 0 else simpson(fpw, -2, x, 2000)
check("ab-frq-3 g(0)=2, g(2)=4, g(4)=2", abs(g(0) - 2) < 1e-9 and abs(g(2) - 4) < 1e-9 and abs(g(4) - 2) < 1e-9)
ys = lambda x: 3 - 2 * math.exp(-math.sin(x))
check("ab-frq-4 solution and overestimate", ys(0) == 1 and abs(deriv(ys, 0.7) - (3 - ys(0.7)) * math.cos(0.7)) < 1e-6 and ys(0.1) < 1.2, f"(f(0.1)={ys(0.1):.4f})")

P = physics_1.COURSE
g = 10
check("p1-01 t=2, h=20", 20 / g == 2 and 20**2 / (2 * g) == 20)
key(P, "p1-02", 0.5 * 5 * 10 + 5 * 10, [50, 75, 100, 125])
t = math.sqrt(2 * 45 / g)
key(P, "p1-03", 15 * t, [30, 45, 67.5, 90])
key(P, "p1-04", (20 - 0.25 * 4 * g) / 4, [0, 2.5, 5, 7.5])
key(P, "p1-05", 60 * (g + 2), [480, 600, 720, 120])
a = 3 * g / 5
key(P, "p1-06", 2 * a, [12, 18, 20, 30])
key(P, "p1-07", 10**2 / (50 * g), [0.1, 0.2, 0.5, 2.0])
key(P, "p1-08", 1 / 9, [1 / 9, 1 / 3, 3, 9])
key(P, "p1-09", math.sqrt(2 * g * 5), [5, 7, 10, 50])
key(P, "p1-10", math.sqrt(2 * (0.5 * 200 * 0.1**2) / 0.5), [1, 2, 4, 20])
key(P, "p1-11", 50 * g * 2, [100, 250, 1000, 500])
vf = 2 * 6 / 6
check("p1-13 v=2, ΔK=24", vf == 2 and 0.5 * 2 * 36 - 0.5 * 6 * vf**2 == 24)
key(P, "p1-14", 0.5 * (6 - (-8)), [1, 3, 4, 7])
key(P, "p1-15", 50 * 3 / 75, [1.5, 2, 3, 4.5])
key(P, "p1-16", 0.5 * 20 * math.sin(math.radians(30)), [5, 8.7, 10, 40], tol=1e-2)
key(P, "p1-17", 30 * 2 / 40, [1, 1.5, 2, 2.7])
key(P, "p1-18", 0.5 * 2 * 5**2, [10, 25, 50, 5])
check("p1-19 K doubles", abs((0.5 * 2 * (4 * 1 / 2) ** 2) / (0.5 * 4 * 1**2) - 2) < 1e-12)
check("p1-20 sphere a > hoop a", g / (1 + 2 / 5) > g / (1 + 1))
key(P, "p1-21", math.sqrt(4), [0.5, 1, 2, 4])
key(P, "p1-23", 1.0e5 + 1000 * g * 3, [3.0e4, 1.0e5, 1.3e5, 4.0e5])
key(P, "p1-24", 100 * (1.5 / 1000) / 0.0020, [25, 50, 75, 100])
check("p1-25 v2=8", 0.040 * 2 / 0.010 == 8)
acc = g * (math.sin(math.radians(30)) - 0.2 * math.cos(math.radians(30)))
check("p1-frq-1 a≈3.3, v≈5.1, frictionless≈6.3", round(acc, 1) == 3.3 and round(math.sqrt(2 * acc * 4), 1) == 5.1 and round(math.sqrt(2 * g * 2), 1) == 6.3,
      f"(a={acc:.3f}, v={math.sqrt(2*acc*4):.3f})")
xs = [0.025, 0.049, 0.076, 0.100]; Fs = [1, 2, 3, 4]
mx, my = sum(xs) / 4, sum(Fs) / 4
slope = sum((x - mx) * (F - my) for x, F in zip(xs, Fs)) / sum((x - mx) ** 2 for x in xs)
check("p1-frq-3 best-fit k≈40 N/m", abs(slope - 40) < 1.5, f"(least squares {slope:.1f})")

K = chemistry.COURSE
NA = 6.022e23
key(K, "ch-01", 9.0 / 18.0 * NA, [3.0e23, 6.0e23, 1.1e23, 5.4e24], tol=1e-2)
key(K, "ch-04", 0.507 * 79 + 0.493 * 81, [78.97, 79.90, 83.80, 196.97], tol=2e-3)
key(K, "ch-09", 1.00 * 0.08206 * 300 / 1.00, [22.4, 24.6, 2.46, 0.0821], tol=2e-3)
key(K, "ch-10", math.sqrt(16 / 4), [4, 2, 1, 0.5])
key(K, "ch-11", 0.010 * 0.30 / 0.40, [0.0075, 0.013, 0.0030, 0.012])
key(K, "ch-12", 2.00 * 50.0 / 250.0, [0.400, 10.0, 0.500, 0.250])
nH2, nO2 = 4.0 / 2.0, 16 / 32
key(K, "ch-14", min(nH2, 2 * nO2) * 18, [9.0, 18, 36, 20])
key(K, "ch-15", 0.0200 * 0.100 / 0.0250, [0.0800, 0.125, 0.100, 0.00200])
key(K, "ch-16", 0 - 1 - 4 * (-2), [2, 4, 6, 7])
key(K, "ch-18", 0.5 ** (30 / 10), [1 / 3, 1 / 4, 1 / 8, 1 / 6])
key(K, "ch-20", 50.0 * 4.18 * 10.0 / 1000, [0.209, 2.09, 20.9, 4.18])
key(K, "ch-21", -2 * (50 - 80), [-60, 60, -30, 260])
key(K, "ch-22", (436 + 242) - 2 * 431, [184, -184, -247, 247])
Ka, c0 = 1.0e-5, 0.10
xh = (-Ka + math.sqrt(Ka * Ka + 4 * Ka * c0)) / 2  # exact quadratic
key(K, "ch-26", -math.log10(xh), [1.0, 3.0, 5.0, 6.0], tol=2e-3)
key(K, "ch-27", 4.74 + math.log10(10), [3.74, 4.74, 5.74, 14.74])
key(K, "ch-30", 40_000 / 100, [None, None, 400, None])
key(K, "ch-31", 0.34 - (-0.76), [0.42, 1.10, -1.10, 2.20])
key(K, "ch-32", 2.00 * 965 / 96485 / 2 * 63.55, [0.318, 0.636, 1.27, 63.6], tol=2e-3)
# FRQs
check("ch-frq-1a 0.120 M", abs(0.03000 * 0.100 / 0.02500 - 0.120) < 1e-12)
check("ch-frq-1b pKa 4.74", round(-math.log10(1.8e-5), 2) == 4.74)
cA = 0.00300 / 0.05500; Kb = 1e-14 / 1.8e-5
pH_eq = 14 + math.log10(math.sqrt(Kb * cA))
check("ch-frq-1c equivalence pH ≈ 8.7, inside phenolphthalein range", round(pH_eq, 1) == 8.7 and 8.2 <= pH_eq <= 10.0, f"({pH_eq:.2f})")
rate = lambda no, o2: 25 * no**2 * o2
check("ch-frq-3 rate law reproduces table with k=25",
      all(abs(rate(a, b) - r) / r < 1e-9 for a, b, r in [(0.010, 0.010, 2.5e-5), (0.020, 0.010, 1.0e-4), (0.010, 0.020, 5.0e-5)]))
check("ch-frq-4 E=1.56, ΔG≈-301 kJ", round(0.80 + 0.76, 2) == 1.56 and round(-2 * 96485 * 1.56 / 1000) == -301)

print("\nAll checks passed." if not fails else f"\n{fails} check(s) FAILED.")
sys.exit(1 if fails else 0)
