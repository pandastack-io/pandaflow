import { redirect } from 'next/navigation';

export default function CredentialsRedirect() {
  redirect('/secrets');
}
