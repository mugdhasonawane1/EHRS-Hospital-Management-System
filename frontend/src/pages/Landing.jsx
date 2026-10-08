import { Link } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { useRole } from '../hooks/useRole';

/**
 * Public marketing page at "/". Deliberately API-free so it renders for
 * anonymous visitors; every call-to-action funnels into the auth flow.
 */

const DEPARTMENTS = [
  {
    name: 'Cardiology',
    blurb: 'Preventive screening, ECG and stress testing, post-operative follow-up.',
    fee: '₹900',
    hours: 'Mon–Fri · 09:00–17:00',
  },
  {
    name: 'Neurology',
    blurb: 'Headache and migraine clinics, epilepsy review, movement disorders.',
    fee: '₹1,100',
    hours: 'Tue, Thu, Sat · 10:00–14:00',
  },
  {
    name: 'General Medicine',
    blurb: 'Primary care, annual health checks, diabetes and hypertension review.',
    fee: '₹500',
    hours: 'Mon–Fri · 09:00–17:00',
  },
  {
    name: 'Orthopaedics',
    blurb: 'Joint pain, sports injuries, fracture care and rehabilitation planning.',
    fee: '₹800',
    hours: 'Mon–Fri · 09:00–13:00',
  },
];

const PORTALS = [
  {
    title: 'For patients',
    icon: <IconCalendar />,
    points: [
      'Book against live consultant availability',
      'Read diagnoses and prescriptions after each visit',
      'Settle invoices online, in full or in part',
    ],
  },
  {
    title: 'For clinicians',
    icon: <IconStethoscope />,
    points: [
      'A day sheet limited to your own patients',
      'Write the visit record and prescription in one form',
      'Publish your weekly consulting hours yourself',
    ],
  },
  {
    title: 'For administration',
    icon: <IconBuilding />,
    points: [
      'Provision consultants and departments centrally',
      'Oversee every appointment across the hospital',
      'Track billed, collected and outstanding revenue',
    ],
  },
];

const STEPS = [
  { n: '01', t: 'Choose a consultant', d: 'Filter by department or specialty and compare consulting hours and fees.' },
  { n: '02', t: 'Pick a live slot', d: 'Only genuinely free times are offered — double-booking is blocked at the source.' },
  { n: '03', t: 'Attend your visit', d: 'Your consultant closes the visit and writes the record while you are still in the room.' },
  { n: '04', t: 'Records and billing', d: 'The chart, prescription and invoice land in your portal the moment the visit ends.' },
];

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const { homePath } = useRole();

  const primaryCta = isAuthenticated
    ? { to: homePath, label: 'Go to my dashboard' }
    : { to: '/register', label: 'Book an appointment' };

  return (
    <div className="lp">
      {/* ------------------------------- nav ------------------------------- */}
      <header className="lp-nav">
        <div className="lp-nav__inner">
          <Link to="/" className="brand">
            <span className="brand__mark" aria-hidden="true">✚</span>
            Meridian Hospital
          </Link>

          <nav className="lp-nav__links">
            <a href="#departments">Departments</a>
            <a href="#portals">Portals</a>
            <a href="#how">How it works</a>
            <a href="#visit">Visit us</a>
          </nav>

          <div className="lp-nav__actions">
            {isAuthenticated ? (
              <Link className="btn btn--primary" to={homePath}>My dashboard</Link>
            ) : (
              <>
                <Link className="btn btn--ghost" to="/login">Sign in</Link>
                <Link className="btn btn--primary" to="/register">Book appointment</Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ------------------------------ hero ------------------------------- */}
      <section className="lp-hero">
        <div className="lp-hero__inner">
          <div className="lp-hero__copy">
            <p className="lp-eyebrow">Meridian General Hospital · Bengaluru</p>
            <h1>Coordinated hospital care, end to end.</h1>
            <p className="lp-lead">
              Book with the right consultant in under a minute, keep every diagnosis and prescription in one
              chart, and settle billing without joining a queue — patients, clinicians and administration on a
              single system.
            </p>

            <div className="lp-cta-row">
              <Link className="btn btn--primary btn--lg" to={primaryCta.to}>{primaryCta.label}</Link>
              {!isAuthenticated && (
                <Link className="btn btn--lg" to="/login">Sign in to your portal</Link>
              )}
            </div>

            <ul className="lp-trust">
              <li>24×7 emergency department</li>
              <li>4 specialty departments</li>
              <li>Same-day consultations</li>
            </ul>
          </div>

          {/* Product preview — the same slot picker patients use after signing in. */}
          <aside className="lp-panel" aria-label="Example of live consultant availability">
            <div className="lp-panel__head">
              <div>
                <strong>Dr. Alice Reed</strong>
                <span className="muted">Interventional Cardiology</span>
              </div>
              <span className="badge badge--completed">Accepting</span>
            </div>

            <p className="lp-panel__label">Thursday · 30-minute slots</p>
            <div className="lp-panel__slots">
              <span className="lp-slot">09:00</span>
              <span className="lp-slot lp-slot--taken">09:30</span>
              <span className="lp-slot">10:00</span>
              <span className="lp-slot lp-slot--active">10:30</span>
              <span className="lp-slot lp-slot--taken">11:00</span>
              <span className="lp-slot">11:30</span>
            </div>

            <div className="lp-panel__foot">
              <span className="muted">Consultation ₹900</span>
              <span className="lp-panel__cta">Confirm booking →</span>
            </div>
          </aside>
        </div>
      </section>

      {/* --------------------------- departments --------------------------- */}
      <section className="lp-section" id="departments">
        <div className="lp-section__inner">
          <header className="lp-section__head">
            <p className="lp-eyebrow">Departments</p>
            <h2>Specialist care under one roof</h2>
            <p className="lp-lead">
              Each department publishes its own consulting hours. Fees below are the standard consultation
              charge before diagnostics.
            </p>
          </header>

          <div className="lp-grid lp-grid--4">
            {DEPARTMENTS.map((d) => (
              <article className="lp-card" key={d.name}>
                <h3>{d.name}</h3>
                <p>{d.blurb}</p>
                <dl className="lp-card__meta">
                  <div><dt>Consultation</dt><dd>{d.fee}</dd></div>
                  <div><dt>Hours</dt><dd>{d.hours}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------- portals ----------------------------- */}
      <section className="lp-section lp-section--alt" id="portals">
        <div className="lp-section__inner">
          <header className="lp-section__head">
            <p className="lp-eyebrow">One system, three portals</p>
            <h2>Everyone sees exactly what they should</h2>
            <p className="lp-lead">
              Access is decided by role and by ownership: a consultant reaches their own patients, a patient
              reaches their own chart, and nothing else is served.
            </p>
          </header>

          <div className="lp-grid lp-grid--3">
            {PORTALS.map((p) => (
              <article className="lp-card lp-card--feature" key={p.title}>
                <span className="lp-card__icon" aria-hidden="true">{p.icon}</span>
                <h3>{p.title}</h3>
                <ul className="lp-list">
                  {p.points.map((pt) => <li key={pt}>{pt}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------- how it works -------------------------- */}
      <section className="lp-section" id="how">
        <div className="lp-section__inner">
          <header className="lp-section__head">
            <p className="lp-eyebrow">How it works</p>
            <h2>From booking to invoice in four steps</h2>
          </header>

          <ol className="lp-steps">
            {STEPS.map((s) => (
              <li className="lp-step" key={s.n}>
                <span className="lp-step__num">{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------ band ------------------------------- */}
      <section className="lp-band" id="visit">
        <div className="lp-band__inner">
          <div className="lp-stat"><strong>24×7</strong><span>Emergency &amp; trauma</span></div>
          <div className="lp-stat"><strong>4</strong><span>Specialty departments</span></div>
          <div className="lp-stat"><strong>30 min</strong><span>Standard consultation</span></div>
          <div className="lp-stat"><strong>Same day</strong><span>Records &amp; invoicing</span></div>
        </div>
      </section>

      {/* ------------------------------ final ------------------------------ */}
      <section className="lp-final">
        <div className="lp-final__inner">
          <div>
            <h2>Ready when you are</h2>
            <p className="lp-lead">
              Create a patient account in a minute, or sign in if the hospital has already issued your
              credentials.
            </p>
          </div>
          <div className="lp-cta-row">
            <Link className="btn btn--primary btn--lg" to={primaryCta.to}>{primaryCta.label}</Link>
            {!isAuthenticated && <Link className="btn btn--lg" to="/login">Sign in</Link>}
          </div>
        </div>
      </section>

      {/* ----------------------------- footer ------------------------------ */}
      <footer className="lp-footer">
        <div className="lp-footer__inner">
          <div className="lp-footer__brand">
            <span className="brand">
              <span className="brand__mark" aria-hidden="true">✚</span>
              Meridian Hospital
            </span>
            <p>
              14 Residency Road, Bengaluru 560025<br />
              Reception +91 80 4000 1200 · Emergency 1066
            </p>
          </div>

          <div className="lp-footer__cols">
            <div>
              <h4>Care</h4>
              <a href="#departments">Departments</a>
              <a href="#how">Booking a visit</a>
              <a href="#visit">Emergency</a>
            </div>
            <div>
              <h4>Portals</h4>
              <Link to="/login">Patient sign in</Link>
              <Link to="/login">Clinician sign in</Link>
              <Link to="/register">Create account</Link>
            </div>
            <div>
              <h4>Hospital</h4>
              <a href="#portals">About the system</a>
              <a href="#visit">Visiting hours</a>
              <a href="#visit">Contact</a>
            </div>
          </div>
        </div>

        <div className="lp-footer__bottom">
          <span>© {new Date().getFullYear()} Meridian General Hospital</span>
          <span>A demonstration hospital management system</span>
        </div>
      </footer>
    </div>
  );
}

/* ----------------------------- inline icons ----------------------------- */
/* Small stroked SVGs keep the page self-contained — no icon dependency. */

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 15h3" />
    </svg>
  );
}

function IconStethoscope() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3v5a4 4 0 0 0 8 0V3" />
      <path d="M4 3h3M13 3h3" />
      <path d="M10 12v3a5 5 0 0 0 10 0v-1" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21V7l8-4 8 4v14" />
      <path d="M4 21h16" />
      <path d="M10 21v-5h4v5" />
      <path d="M12 8v4M10 10h4" />
    </svg>
  );
}
