import { useRouter } from "next/router";
import { useMemo } from "react";

export default function ContractSignedPage() {
    const router = useRouter();
    const { id } = router.query;

    // Build the download URL only when we have an id
    const downloadHref = useMemo(() => {
        if (!id || typeof id !== "string") return "";
        return `/api/contracts/${id}/download`;
    }, [id]);

    return (
        <div className="mx-auto max-w-3xl p-6 space-y-6">
            <h1 className="text-2xl font-semibold">Contract signed</h1>
            <p className="text-sm text-gray-600">
                The contract has been completed. You can download the executed PDF below.
            </p>

            <div>
                <a
                    href={downloadHref || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                        "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white " +
                        (downloadHref ? "bg-indigo-600 hover:bg-indigo-700" : "bg-gray-400 cursor-not-allowed")
                    }
                    aria-disabled={!downloadHref}
                >
                    Download executed PDF
                </a>
            </div>

            {/* Optional: to show the PDF inline instead of a new tab, uncomment this iframe */}
            {/* {downloadHref && (
        <iframe
          className="w-full h-[80vh] rounded-lg border"
          src={downloadHref}
        />
      )} */}
        </div>
    );
}
