'use client';

import { FeatureGrid } from '@/components/FeatureGrid';

export default function FeaturesPage() {
  return (
    <div className="content">
      <div className="page-head">
        <h1>Features</h1>
        <span className="muted">Turn modules on or off. Changes go live when you publish.</span>
      </div>
      <FeatureGrid />
    </div>
  );
}
