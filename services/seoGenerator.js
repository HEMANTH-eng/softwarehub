/**
 * SEO & Structured Data Schema Generator
 */

/**
 * Generates OpenGraph, Twitter Cards, and Meta Tags
 */
function generateSeoTags(software, baseUrl = 'https://softwarehub.me') {
  const canonicalUrl = `${baseUrl}/detail/${software.id || ''}`;
  const title = software.seo_title || `Download ${software.name || 'Software'} v${software.version || '1.0.0'} - Free Download`;
  const description = software.seo_meta_description || software.short_description || `Download ${software.name} for Windows / Mobile. Safe direct download.`;
  const imageUrl = software.icon_image ? (software.icon_image.startsWith('http') ? software.icon_image : `${baseUrl}/storage/images/${software.icon_image}`) : `${baseUrl}/public/logo.png`;
  const keywords = Array.isArray(software.seo_keywords) ? software.seo_keywords.join(', ') : (software.seo_keywords || `${software.name}, download ${software.name}, free download`);

  return {
    title,
    description,
    keywords,
    canonicalUrl,
    openGraph: {
      'og:title': title,
      'og:description': description,
      'og:type': 'website',
      'og:url': canonicalUrl,
      'og:image': imageUrl,
      'og:site_name': 'Software Hub Pro'
    },
    twitterCard: {
      'twitter:card': 'summary_large_image',
      'twitter:title': title,
      'twitter:description': description,
      'twitter:image': imageUrl
    }
  };
}

/**
 * Generates Google-Compliant SoftwareApplication JSON-LD Schema
 */
function generateSoftwareJsonLd(software, baseUrl = 'https://softwarehub.me') {
  const canonicalUrl = `${baseUrl}/detail/${software.id || ''}`;
  const imageUrl = software.icon_image ? (software.icon_image.startsWith('http') ? software.icon_image : `${baseUrl}/storage/images/${software.icon_image}`) : `${baseUrl}/public/logo.png`;

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": software.name,
    "operatingSystem": software.operating_systems || software.platform || "Windows 11, Windows 10",
    "applicationCategory": software.category || "DesktopApplication",
    "softwareVersion": software.version || "1.0.0",
    "fileSize": software.size || "25.0 MB",
    "url": canonicalUrl,
    "image": imageUrl,
    "description": software.short_description || software.full_description,
    "publisher": {
      "@type": "Organization",
      "name": software.publisher || software.developer || "Official Developer"
    },
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "1250"
    }
  };
}

/**
 * Generates Google-Compliant BreadcrumbList JSON-LD Schema
 */
function generateBreadcrumbJsonLd(software, categoryName = 'Software', baseUrl = 'https://softwarehub.me') {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": baseUrl
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": categoryName,
        "item": `${baseUrl}/category/${software.category_id || 1}`
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": software.name,
        "item": `${baseUrl}/detail/${software.id || ''}`
      }
    ]
  };
}

module.exports = {
  generateSeoTags,
  generateSoftwareJsonLd,
  generateBreadcrumbJsonLd
};
