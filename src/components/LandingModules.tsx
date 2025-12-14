import React from 'react';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Users, Video, Palette, Sparkles, Box, DollarSign, Newspaper, BookOpenText, CreditCard, Activity } from 'lucide-react';

const Icons: Record<string, React.ElementType> = {
  LayoutDashboard,
  Users,
  Video,
  Palette,
  Sparkles,
  Box,
  DollarSign,
  Newspaper,
  BookOpenText,
  CreditCard,
  Activity
};

export const FeaturesSection = () => {
  const { t } = useTranslation();
  const items = t('features.items', { returnObjects: true }) as any[];

  return (
    <section className="features-section" id="features">
      <div className="section-header-centered">
        <h2 className="section-title-large">{t('features.title')}</h2>
        <p className="section-subtitle">{t('features.description')}</p>
      </div>
      <div className="features-grid">
        {items.map((item, index) => {
          const Icon = Icons[item.icon] || Sparkles;
          return (
            <div key={index} className="feature-card">
              <div className="feature-icon">
                <Icon size={32} />
              </div>
              <h3 className="feature-title">{item.title}</h3>
              <p className="feature-desc">{item.description}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export const StatsSection = () => {
  const { t } = useTranslation();
  const items = t('stats.items', { returnObjects: true }) as any[];

  return (
    <section className="stats-section">
      <h2 className="section-title-large">{t('stats.title')}</h2>
      <div className="stats-grid">
        {items.map((item, index) => (
          <div key={index} className="stat-card">
            <div className="stat-value">{item.title}</div>
            <div className="stat-label">{item.description}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

export const PricingSection = () => {
  const { t } = useTranslation();
  const items = t('pricing.items', { returnObjects: true }) as any[];

  return (
    <section className="pricing-section" id="pricing">
      <div className="section-header-centered">
        <h2 className="section-title-large">{t('pricing.title')}</h2>
        <p className="section-subtitle">{t('pricing.description')}</p>
      </div>
      <div className="pricing-grid">
        {items.map((item, index) => (
          <div key={index} className={`pricing-card ${item.popular ? 'popular' : ''}`}>
            {item.popular && <div className="popular-badge">POPULAR</div>}
            <h3 className="pricing-name">{item.name}</h3>
            <p className="pricing-desc">{item.description}</p>
            <div className="pricing-price">
              <span className="price-value">{item.price}</span>
              <span className="price-period">{item.period}</span>
            </div>
            <ul className="pricing-features">
              {item.features.map((feature: string, i: number) => (
                <li key={i}>✓ {feature}</li>
              ))}
            </ul>
            <button className={`pricing-btn ${item.popular ? 'primary' : ''}`}>
              {item.button}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

export const FAQSection = () => {
  const { t } = useTranslation();
  const items = t('faq.items', { returnObjects: true }) as any[];

  return (
    <section className="faq-section" id="faq">
      <div className="section-header-centered">
        <h2 className="section-title-large">{t('faq.title')}</h2>
        <p className="section-subtitle">{t('faq.description')}</p>
      </div>
      <div className="faq-list">
        {items.map((item, index) => (
          <details key={index} className="faq-item">
            <summary className="faq-question">{item.question}</summary>
            <p className="faq-answer">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
};

export const FooterSection = () => {
  const { t } = useTranslation();

  return (
    <footer className="landing-footer">
      <div className="footer-content">
        <div className="footer-brand">
          <h3 className="footer-logo">Anime AI Studio</h3>
          <p className="footer-desc">{t('footer.brand.description')}</p>
        </div>
        <div className="footer-links">
           {/* Add links here if needed */}
        </div>
      </div>
      <div className="footer-bottom">
        <p>{t('footer.copyright')}</p>
      </div>
    </footer>
  );
};
