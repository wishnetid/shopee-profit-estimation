import type { Metadata } from 'next';
import LoginForm from '@/components/LoginForm';

export const metadata: Metadata = {
  title: 'Masuk | Shopee Profit Estimation',
  description: 'Masuk ke dashboard estimasi profit Shopee',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;
  const requestedNext = typeof params.next === 'string' ? params.next : '/';

  return <LoginForm requestedNext={requestedNext} />;
}
