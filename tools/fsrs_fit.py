#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
fsrs_fit.py — FSRS Phase B : ajuste les poids FSRS-5 (w[0..16]) aux données réelles de l'utilisateur.

Le journal de révisions (ST.rlog) vit dans la sauvegarde cloud. Ce script :
  1. (selftest) VERROUILLE le portage : reproduit au bit près les formules de docs/engine.js
     (référence tools/fsrs_ref.json générée par tools/fsrs_ref_gen.js).
  2. (fit) rejoue chaque séquence de carte EXACTEMENT comme fsrsSchedule (init 1re révision,
     gel des re-vus intra-jour elapsed<1, transition S/D des révisions comptées), calcule la
     perte log (cross-entropy) de prédiction du rappel, et optimise w[0..16] sous contraintes
     (Adam + projection, numpy pur — pas de dépendance lourde). Validation 80/20 par carte.

w[17]/w[18] (mémoire court-terme FSRS-5) ne sont PAS utilisés par Sori (re-vus intra-jour gelés)
→ non ajustés, laissés à leur valeur par défaut. DECAY reste figé à -0.5 (FSRS-5).

Usage :
  python tools/fsrs_fit.py --selftest
  python tools/fsrs_fit.py --fit <export.json> [--out <weights.json>]
Le fichier d'export est PERSONNEL — jamais commité (il est passé en argument, hors du repo).
"""
import sys, json, io, argparse, os
import numpy as np

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

DECAY = -0.5
FACTOR = 19.0 / 81.0
S_MIN, S_MAX, DR = 0.1, 36500.0, 0.9

def clampS(s): return np.minimum(S_MAX, np.maximum(S_MIN, s))
def clampD(d): return np.minimum(10.0, np.maximum(1.0, d))

def fsrsR(t, S):            return np.power(1.0 + FACTOR * t / S, DECAY)
def fsrsIntervalDays(S, Rd): return (S / FACTOR) * (np.power(Rd, 1.0 / DECAY) - 1.0)

def initS(G, w):
    # G scalaire ou array d'entiers 1..4 -> w[clip(G-1,0,3)]
    idx = np.clip(np.asarray(G, dtype=int) - 1, 0, 3)
    return clampS(np.asarray(w)[idx])

def initD(G, w):
    return clampD(w[4] - np.exp(w[5] * (np.asarray(G, dtype=float) - 1.0)) + 1.0)

def nextD(D, G, w):
    G = np.asarray(G, dtype=float)
    lin = D + (-w[6] * (G - 3.0)) * (10.0 - D) / 9.0
    return clampD(w[7] * initD(4, w) + (1.0 - w[7]) * lin)

def succS(D, S, R, G, w):
    G = np.asarray(G)
    hard = np.where(G == 2, w[15], 1.0)
    easy = np.where(G == 4, w[16], 1.0)
    inc = np.exp(w[8]) * (11.0 - D) * np.power(S, -w[9]) * (np.exp(w[10] * (1.0 - R)) - 1.0) * hard * easy
    return clampS(S * (1.0 + inc))

def failS(D, S, R, w):
    post = w[11] * np.power(D, -w[12]) * (np.power(S + 1.0, w[13]) - 1.0) * np.exp(w[14] * (1.0 - R))
    return clampS(np.minimum(post, S))

def easeToD(e):
    # ease Sori (1.3 dur → 3 facile) → D (10 dur → 1 facile). Seed des cartes migrées.
    e = np.minimum(3.0, np.maximum(1.3, np.asarray(e, dtype=float)))
    return clampD(10.0 - (e - 1.3) / 1.7 * 9.0)

# ---------------------------------------------------------------- selftest
def selftest(ref_path):
    ref = json.load(open(ref_path, encoding="utf-8"))
    w = ref["W"]
    assert abs(ref["DECAY"] - DECAY) < 1e-12, "DECAY mismatch"
    assert abs(ref["FACTOR"] - FACTOR) < 1e-12, "FACTOR mismatch"
    fns = {
        "fsrsR": lambda a: fsrsR(a[0], a[1]),
        "fsrsIntervalDays": lambda a: fsrsIntervalDays(a[0], a[1]),
        "fsrsInitS": lambda a: float(initS(a[0], w)),
        "fsrsInitD": lambda a: float(initD(a[0], w)),
        "fsrsNextD": lambda a: float(nextD(a[0], a[1], w)),
        "fsrsSuccS": lambda a: float(succS(a[0], a[1], a[2], a[3], w)),
        "fsrsFailS": lambda a: float(failS(a[0], a[1], a[2], w)),
        "easeToD": lambda a: float(easeToD(a[0])),
    }
    worst = 0.0
    for c in ref["cases"]:
        got = float(fns[c["fn"]](c["args"]))
        exp = float(c["out"])
        d = abs(got - exp)
        rel = d / (abs(exp) + 1e-12)
        worst = max(worst, rel)
        if rel > 1e-9:
            print(f"MISMATCH {c['fn']}{c['args']}: got {got!r} exp {exp!r} (rel {rel:.2e})")
            return False
    print(f"selftest OK — {len(ref['cases'])} cas, écart relatif max {worst:.2e}")
    return True

# ---------------------------------------------------------------- data
# kind d'exercice PLAFONNÉ à 4 (rappel sans aide) : la note journalisée EST la note brute → gradeD = note.
# Tout autre kind est plafonné (≤ Difficile) : la note stockée est plafonnée, la note BRUTE d'un succès
# était Bien(3) (bouton positif binaire) → gradeD = 3 (succès) / 1 (échec). Miroir de la dissociation v64.
GRADE4_KINDS = {"rec5", "type"}

def reconstruct_gradeD(note, kind):
    if kind is None:                 # entrée 4 champs (≤ v63) : pas de dissociation, D suivait la note stockée
        return note
    if kind in GRADE4_KINDS:         # rappel sans aide (maxG=4) : note stockée = note brute
        return note
    return 3 if note >= 2 else 1     # exercice aidé/plafonné : brute = Bien si succès

def extract_sequences(export_path):
    d = json.load(open(export_path, encoding="utf-8"))
    st = d["state"]
    rlog = st.get("rlog", [])
    items = st.get("items", {}) or {}
    seqs = {}   # id -> list of (note_plafonnée, gradeD, elapsed), ordre chrono (rlog = FIFO append)
    lens = {}
    for r in rlog:
        if not r or len(r) < 4: continue
        iid, note, elapsed = r[1], r[2], r[3]
        kind = r[4] if len(r) >= 5 and r[4] else None
        try:
            note = int(note); elapsed = float(elapsed)
        except (TypeError, ValueError):
            continue
        if note < 1 or note > 4: continue
        lens[len(r)] = lens.get(len(r), 0) + 1
        seqs.setdefault(iid, []).append((note, reconstruct_gradeD(note, kind), elapsed))
    # ease par carte (seed D des migrées) — depuis l'état item courant (proxy stable de l'ease de migration)
    ease = {iid: (items.get(iid, {}) or {}).get("e", 2.5) for iid in seqs}
    return seqs, ease, lens

def build_padded(seqs, ease):
    ids = list(seqs.keys())
    maxlen = max((len(seqs[i]) for i in ids), default=0)
    n = len(ids)
    notes = np.ones((n, maxlen), dtype=int)
    gradeD = np.ones((n, maxlen), dtype=int)
    elapsed = np.zeros((n, maxlen), dtype=float)
    valid = np.zeros((n, maxlen), dtype=bool)
    seed_ease = np.full(n, 2.5, dtype=float)
    for i, iid in enumerate(ids):
        seed_ease[i] = ease.get(iid, 2.5)
        for t, (g, gd, e) in enumerate(seqs[iid]):
            notes[i, t] = g; gradeD[i, t] = gd; elapsed[i, t] = e; valid[i, t] = True
    return ids, notes, gradeD, elapsed, valid, seed_ease

# ---------------------------------------------------------------- loss (replay lockstep)
def replay_loss(w, notes, gradeD, elapsed, valid, seed_ease, want_calib=False):
    """Rejoue toutes les cartes en pas-à-pas par index de révision. Retourne mean-logloss.
       Fidèle à fsrsSchedule :
       - carte NEUVE (elapsed[0]==0) : pos0 = init (S=initS(note0), D=initD(gradeD0)), NON comptée ;
       - carte MIGRÉE (elapsed[0]>=1) : pos0 amorcée S←elapsed0 (proxy itv), D←easeToD(ease), COMPTÉE ;
       - à chaque t : elapsed<1 -> gelé (aucune perte/transition) ; elapsed>=1 -> comptée (perte + transition).
       Canal S = note PLAFONNÉE (succS/hard-easy) ; canal D = gradeD BRUT (nextD) — dissociation v64."""
    w = np.asarray(w, dtype=float)
    n, maxlen = notes.shape
    migrated = elapsed[:, 0] >= 1.0
    S = np.where(migrated, clampS(np.maximum(0.5, elapsed[:, 0])), initS(notes[:, 0], w)).astype(float)
    D = np.where(migrated, easeToD(seed_ease), initD(gradeD[:, 0], w)).astype(float)
    eps = 1e-6
    tot_loss = 0.0; count = 0
    sum_pred = 0.0; sum_act = 0.0   # calibration
    for t in range(0, maxlen):
        m = valid[:, t]
        e = elapsed[:, t]
        g = notes[:, t]           # note plafonnée → canal stabilité
        gd = gradeD[:, t]         # note brute reconstruite → canal difficulté
        counted = m & (e >= 1.0)  # pos0 d'une NEUVE a e==0 → non comptée (init déjà posé)
        if not counted.any():
            continue
        R = fsrsR(e, S)
        y = (g >= 2).astype(float)
        Rc = np.clip(R[counted], eps, 1.0 - eps)
        yc = y[counted]
        tot_loss += -np.sum(yc * np.log(Rc) + (1.0 - yc) * np.log(1.0 - Rc))
        count += int(counted.sum())
        if want_calib:
            sum_pred += float(np.sum(Rc)); sum_act += float(np.sum(yc))
        success = g >= 2
        Dn = nextD(D, gd, w)
        Snew = np.where(success, succS(D, S, R, g, w), failS(D, S, R, w))
        S = np.where(counted, Snew, S)
        D = np.where(counted, Dn, D)
    mean = tot_loss / max(1, count)
    if want_calib:
        return mean, count, (sum_pred / max(1, count)), (sum_act / max(1, count))
    return mean, count

# w[0..16] ajustables ; bornes FSRS-5 (fsrs-optimizer v5)
BOUNDS = [
    (0.01, 100), (0.01, 100), (0.01, 100), (0.01, 100),   # 0-3 init S (Again/Hard/Good/Easy)
    (1.0, 10.0),        # 4 init D
    (0.001, 4.0),       # 5
    (0.001, 4.0),       # 6
    (0.001, 0.75),      # 7
    (0.0, 4.5),         # 8
    (0.0, 0.8),         # 9
    (0.001, 3.5),       # 10
    (0.001, 5.0),       # 11
    (0.001, 0.25),      # 12
    (0.001, 0.9),       # 13
    (0.0, 4.0),         # 14
    (0.0, 1.0),         # 15 hard penalty
    (1.0, 6.0),         # 16 easy bonus
]

# Poids NON identifiables sur ~10 j de données à intervalles courts et notation quasi-binaire → GELÉS au
# générique (revue adversariale Phase B) : w6/w7 (dynamique de D — sans eux le fit crée un CLIQUET de D
# qui sur-révise les cartes ratées ×2.6), w9 (amortissement S des cartes mûres, absentes), w12/w14 (post-
# lapse : dépendance en D et en R au moment de l'oubli, peu de fails à R varié), w16 (bonus Easy, 46 notes
# seulement) ; w17/w18 (mémoire court-terme, inutilisés). Tous glissaient à leurs bornes = sur-apprentissage.
# On n'ajuste que le bloc identifié (S0 + croissance de stabilité court/moyen terme).
FROZEN_IDX = [6, 7, 9, 12, 14, 16, 17, 18]

def fd_grad(f, x, h=1e-5):
    g = np.zeros(len(x))
    for i in range(len(x)):
        step = h * max(1.0, abs(x[i]))
        xp = x.copy(); xp[i] += step
        xm = x.copy(); xm[i] -= step
        g[i] = (f(xp) - f(xm)) / (2 * step)
    return g

def fit(w0, data, steps=1500, lr=0.02):
    """Adam + projection. Ajuste UNIQUEMENT les indices non gelés ; le reste reste à w0 (générique)."""
    notes, gradeD, elapsed, valid, seed_ease = data
    w = np.asarray(w0, dtype=float).copy()
    free = [i for i in range(len(BOUNDS)) if i not in FROZEN_IDX]
    def f(wfull): return replay_loss(wfull, notes, gradeD, elapsed, valid, seed_ease)[0]
    def fx(xfree):
        wf = w.copy()
        for k, i in enumerate(free): wf[i] = xfree[k]
        return f(wf)
    x = np.array([w[i] for i in free], dtype=float)
    nf = len(free)
    m = np.zeros(nf); v = np.zeros(nf)
    b1, b2, eps = 0.9, 0.999, 1e-8
    best_x = x.copy(); best_loss = fx(x)
    for step in range(1, steps + 1):
        g = fd_grad(fx, x)
        m = b1 * m + (1 - b1) * g
        v = b2 * v + (1 - b2) * g * g
        mh = m / (1 - b1 ** step); vh = v / (1 - b2 ** step)
        x = x - lr * mh / (np.sqrt(vh) + eps)
        for k, i in enumerate(free):
            lo, hi = BOUNDS[i]; x[k] = min(hi, max(lo, x[k]))
        if step % 50 == 0 or step == 1:
            l = fx(x)
            if l < best_loss: best_loss = l; best_x = x.copy()
    l = fx(x)
    if l < best_loss: best_loss = l; best_x = x.copy()
    wf = w.copy()
    for k, i in enumerate(free): wf[i] = best_x[k]
    return wf, best_loss

# ---------------------------------------------------------------- main
def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--fit", metavar="EXPORT")
    ap.add_argument("--ref", default=os.path.join(here, "fsrs_ref.json"))
    ap.add_argument("--out", default=None)
    ap.add_argument("--steps", type=int, default=1500)
    args = ap.parse_args()

    if args.selftest or args.fit:
        if not selftest(args.ref):
            print("SELFTEST ÉCHOUÉ — port incorrect, on n'ajuste rien."); sys.exit(1)
    if not args.fit:
        return

    ref = json.load(open(args.ref, encoding="utf-8"))
    W_DEF = np.asarray(ref["W"], dtype=float)

    seqs, ease, lens = extract_sequences(args.fit)
    ids, notes, gradeD, elapsed, valid, seed_ease = build_padded(seqs, ease)
    migr = int((elapsed[:, 0] >= 1.0).sum())
    print(f"\ncartes: {len(ids)} ({migr} migrées / {len(ids)-migr} neuves) | révisions: {int(valid.sum())} | maxlen: {notes.shape[1]}")
    print(f"champs rlog (régime de notation) : {dict(sorted(lens.items()))}  (4=pré-v64, 7=v65+)")
    print(f"poids ajustés : {[i for i in range(17) if i not in FROZEN_IDX]} | gelés au générique : {FROZEN_IDX}")

    ALL = (notes, gradeD, elapsed, valid, seed_ease)
    # split 80/20 par carte (déterministe)
    rng = np.random.RandomState(42)
    perm = rng.permutation(len(ids))
    ntest = max(1, len(ids) // 5)
    test_idx = np.zeros(len(ids), dtype=bool); test_idx[perm[:ntest]] = True
    train = ~test_idx

    def subset(mask):
        return (notes[mask], gradeD[mask], elapsed[mask], valid[mask], seed_ease[mask])

    TR = subset(train); TE = subset(test_idx)

    d_tr = replay_loss(W_DEF, *TR, want_calib=True)
    d_te = replay_loss(W_DEF, *TE, want_calib=True)
    print(f"\n--- POIDS PAR DÉFAUT (génériques) ---")
    print(f"  train: logloss {d_tr[0]:.4f} sur {d_tr[1]} rev | prédit R={d_tr[2]:.3f} vs réel {d_tr[3]:.3f}")
    print(f"  test : logloss {d_te[0]:.4f} sur {d_te[1]} rev | prédit R={d_te[2]:.3f} vs réel {d_te[3]:.3f}")

    print(f"\najustement (Adam {args.steps} pas)…")
    w_fit_tr, _ = fit(W_DEF, TR, steps=args.steps)
    f_tr = replay_loss(w_fit_tr, *TR, want_calib=True)
    f_te = replay_loss(w_fit_tr, *TE, want_calib=True)
    print(f"\n--- POIDS AJUSTÉS (fit sur train) ---")
    print(f"  train: logloss {f_tr[0]:.4f} | prédit R={f_tr[2]:.3f} vs réel {f_tr[3]:.3f}")
    print(f"  test : logloss {f_te[0]:.4f} | prédit R={f_te[2]:.3f} vs réel {f_te[3]:.3f}")
    gain_te = 100 * (d_te[0] - f_te[0]) / d_te[0]
    print(f"  >>> gain logloss HORS-ÉCHANTILLON : {gain_te:+.1f}%  (calibration réel {f_te[3]:.3f} — prédit défaut {d_te[2]:.3f} -> ajusté {f_te[2]:.3f})")

    # fit final sur TOUTES les données pour livraison
    print(f"\nfit final sur toutes les données…")
    w_final, l_final = fit(W_DEF, ALL, steps=args.steps)
    a_all = replay_loss(w_final, *ALL, want_calib=True)
    d_all = replay_loss(W_DEF, *ALL, want_calib=True)
    print(f"  défaut  : logloss {d_all[0]:.4f} | prédit {d_all[2]:.3f} vs réel {d_all[3]:.3f}")
    print(f"  ajusté  : logloss {a_all[0]:.4f} | prédit {a_all[2]:.3f} vs réel {a_all[3]:.3f}")

    # interprétation : stabilité initiale + 1er intervalle à R cible
    print(f"\n--- LECTURE ---")
    for name, gi in [("Again(1)", 1), ("Hard(2)", 2), ("Good(3)", 3), ("Easy(4)", 4)]:
        s_def = float(initS(gi, W_DEF)); s_fit = float(initS(gi, w_final))
        i_def = max(1, round(float(fsrsIntervalDays(s_def, DR))))
        i_fit = max(1, round(float(fsrsIntervalDays(s_fit, DR))))
        print(f"  S0 {name:9s}: {s_def:6.3f}j -> {s_fit:6.3f}j  (1er intervalle @R0.9 : {i_def}j -> {i_fit}j)")

    w_out = [round(float(x), 6) for x in w_final]
    print(f"\nFSRS_W_PERSONAL = {w_out}")
    if args.out:
        json.dump({"weights": w_out, "fittedAt": None,
                   "logloss_default": round(float(d_all[0]), 4),
                   "logloss_personal": round(float(a_all[0]), 4),
                   "reviews": int(valid.sum()), "cards": len(ids)},
                  open(args.out, "w"), indent=2)
        print(f"écrit -> {args.out}")

if __name__ == "__main__":
    main()
