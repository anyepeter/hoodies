// The card row under "Add to cart" and in the footer: American Express, Diners, Discover, JCB,
// Mastercard, PayPal, Visa. Simple badges drawn here so there are no third-party requests.

const Card = ({ children, bg = "#fff", label }: { children: React.ReactNode; bg?: string; label: string }) => (
  <svg viewBox="0 0 38 24" width="38" height="24" role="img" aria-label={label} className="shrink-0">
    <rect x="0.5" y="0.5" width="37" height="23" rx="3" fill={bg} stroke="#000" strokeOpacity="0.07" />
    {children}
  </svg>
);

export function PaymentIcons({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap items-center justify-center gap-2 ${className}`} aria-label="Payment methods">
      <li>
        <Card label="American Express" bg="#1F72CD">
          <text x="19" y="11" textAnchor="middle" fontSize="6.4" fontWeight="800" fill="#fff" fontFamily="Arial">AM</text>
          <text x="19" y="18" textAnchor="middle" fontSize="6.4" fontWeight="800" fill="#fff" fontFamily="Arial">EX</text>
        </Card>
      </li>
      <li>
        <Card label="Diners Club">
          <circle cx="19" cy="12" r="6.5" fill="none" stroke="#0079BE" strokeWidth="1.6" />
          <path d="M17 8.6v6.8M21 8.6v6.8" stroke="#0079BE" strokeWidth="1.4" />
        </Card>
      </li>
      <li>
        <Card label="Discover">
          <text x="4" y="14.5" fontSize="6" fontWeight="700" fill="#231F20" fontFamily="Arial">DISC</text>
          <circle cx="22.6" cy="12.6" r="2.6" fill="#F48120" />
          <text x="25.6" y="14.5" fontSize="6" fontWeight="700" fill="#231F20" fontFamily="Arial">VER</text>
        </Card>
      </li>
      <li>
        <Card label="JCB">
          <rect x="7" y="5" width="7.5" height="14" rx="2" fill="#0E4C96" />
          <rect x="15.25" y="5" width="7.5" height="14" rx="2" fill="#E21836" />
          <rect x="23.5" y="5" width="7.5" height="14" rx="2" fill="#00A651" />
          <text x="19" y="14.3" textAnchor="middle" fontSize="6" fontWeight="800" fill="#fff" fontFamily="Arial">JCB</text>
        </Card>
      </li>
      <li>
        <Card label="Mastercard" bg="#252525">
          <circle cx="15.5" cy="12" r="6" fill="#EB001B" />
          <circle cx="22.5" cy="12" r="6" fill="#F79E1B" />
          <path d="M19 7.1a6 6 0 010 9.8 6 6 0 010-9.8z" fill="#FF5F00" />
        </Card>
      </li>
      <li>
        <Card label="PayPal">
          <path d="M15.6 6.5h4.6c2.3 0 3.4 1.2 3 3.2-.4 2.3-2 3.4-4.3 3.4h-1.3l-.7 4.2h-2.6l1.3-10.8z" fill="#003087" />
          <path d="M17.6 9h3.4c1.7 0 2.4.9 2.1 2.3-.3 1.7-1.5 2.5-3.2 2.5h-1l-.5 3.1h-1.9L17.6 9z" fill="#009CDE" />
        </Card>
      </li>
      <li>
        <Card label="Visa">
          <text x="19" y="15.6" textAnchor="middle" fontSize="9" fontWeight="900" fontStyle="italic" fill="#142688" fontFamily="Arial">VISA</text>
        </Card>
      </li>
    </ul>
  );
}
