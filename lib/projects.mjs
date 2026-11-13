/* The "Selected work" cards, shared by the site and the CV.

   Project cards are composed from string codes; the card *list* and its links
   are structure, not copy. Display order is this array; the p<n> codes are
   identifiers, not positions, so a card can move without renumbering every
   other card in two catalogs. The CV renders this same list in this same
   order, so a card added here reaches the PDF with no second step.

   `repos` is a list because one project can span several repositories. A
   repo's `name` labels its link; without one the link carries the project's
   name. Repository names are identifiers, not copy, which is why they live
   here rather than in the catalogs. */

/** Every card, in display order. `s` resolves a string code for one locale. */
export function projectCards(s) {
    return [
        {
            tags: s("p7_tags"), name: s("p7_name"), description: s("p7_desc"),
            siteURL: "https://jctec.github.io/sideshore-site/",
            appStoreURL: "https://apps.apple.com/app/sideshore/id6820650870", repos: [],
        },
        {
            tags: s("p8_tags"), name: s("p8_name"), description: s("p8_desc"),
            appStoreURL: null,
            repos: [
                { name: "zhen-core", url: "https://github.com/zhen-swift/zhen-core" },
                { name: "zhen-app", url: "https://github.com/zhen-swift/zhen-app" },
                { name: "zhen-study", url: "https://github.com/zhen-swift/zhen-study" },
            ],
        },
        {
            tags: s("p6_tags"), name: s("p6_name"), description: s("p6_desc"),
            siteURL: "https://afterdarkstories.mx", appStoreURL: null, repos: [],
        },
        {
            tags: s("p2_tags"), name: s("p2_name"), description: s("p2_desc"),
            appStoreURL: "https://apps.apple.com/app/mythlog/id6797111874", repos: [],
        },
        {
            tags: s("p1_tags"), name: s("p1_name"), description: s("p1_desc"),
            appStoreURL: "https://apps.apple.com/app/tapper-counters/id6475695007",
            repos: [{ url: "https://github.com/JCTec/Tapper" }],
        },
        {
            tags: s("p3_tags"), name: s("p3_name"), description: s("p3_desc"),
            appStoreURL: null, repos: [{ url: "https://github.com/swift-calendar/icalendarkit" }],
        },
        {
            tags: s("p4_tags"), name: s("p4_name"), description: s("p4_desc"),
            appStoreURL: "https://apps.apple.com/app/ibase/id1346871946",
            repos: [{ url: "https://github.com/JCTec/iBase" }],
        },
    ];
}

/** A card's outbound links in the order the card shows them: the site, the
    App Store, then each repository. The site words each link from `kind` and
    `name`; the CV shows the bare URL. One list for both, so a link cannot
    appear on one render target and not the other. */
export function projectLinks(project) {
    return [
        ...(project.siteURL ? [{ kind: "site", url: project.siteURL }] : []),
        ...(project.appStoreURL ? [{ kind: "appStore", url: project.appStoreURL }] : []),
        ...project.repos.map((repo) => ({ kind: "repo", url: repo.url, name: repo.name ?? project.name })),
    ];
}
