import type { Metadata } from 'next';
import { CollegeProductSurvey } from '@/components/college-product-survey';

export const metadata: Metadata = {
  title: 'College Product Survey',
  description:
    'Help WOW RIGHT learn what college students want us to create next.',
  robots: { index: true, follow: true },
};

export default function SurveyPage() {
  return <CollegeProductSurvey />;
}
