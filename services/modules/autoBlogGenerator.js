/**
 * Future Ready Module: Auto Blog Generator
 * Generates release blog posts for newly added software.
 */
function generateBlogPost(softwareName, version, shortDesc, features = []) {
  return {
    title: `Introducing ${softwareName} v${version}: Features and Installation Guide`,
    slug: `${softwareName.toLowerCase().replace(/\s+/g, '-')}-v${version.replace(/\./g, '-')}-release`,
    content: `We are excited to announce the availability of **${softwareName} v${version}** on Software Hub Pro!\n\n${shortDesc}\n\n### Highlights:\n${features.map(f => `- ${f}`).join('\n')}`,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  generateBlogPost
};
