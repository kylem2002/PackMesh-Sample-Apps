import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'PackMesh TypeScript Sample App | API Integration + Business Value',
  description:
    'Next.js PackMesh sample app showing how businesses can integrate faster, reduce rollout risk, and unlock measurable packaging and freight KPI improvements.',
  keywords: ['PackMesh sample app', 'Next.js API integration', 'packaging optimization', 'logistics ROI'],
  openGraph: {
    title: 'PackMesh TypeScript Sample App',
    description:
      'Production-inspired Next.js reference implementation for PackMesh APIs with clear business-value outcomes.',
    type: 'website'
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
