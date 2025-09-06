// pages/_app.js
import "../styles/globals.css";
import Header from "../components/header";
import { useRouter } from "next/router";
import { useEffect } from "react";

export default function MyApp({ Component, pageProps }) {
  const router = useRouter();

  // If a page exports `noHeader = true`, we skip rendering the global header
  const noHeader = Component.noHeader === true;

  // Auto-hide the global header on client upload routes
  const isClientRoute =
    typeof router?.pathname === "string" && router.pathname.startsWith("/client/");

  useEffect(() => {
    // place for analytics or route checks if you want later
  }, [router.pathname]);

  return (
    <>
      {!noHeader && !isClientRoute && <Header />}
      <Component {...pageProps} />
    </>
  );
}
