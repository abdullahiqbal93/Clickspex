export type AttributeNamespace = "html" | "svg-xlink" | "xml";

const SVG_XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";
const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";

export const IDENTITY_ATTRIBUTES = new Set(["id", "class"]);

const URL_ATTRIBUTES = new Set([
  "action",
  "cite",
  "formaction",
  "href",
  "poster",
  "src",
  "srcset",
  "xlink:href",
]);
const SAFE_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:", "sms:"]);
const SAFE_RESOURCE_PROTOCOLS = new Set(["http:", "https:", "blob:"]);
const SAFE_DATA_IMAGE_PATTERN = /^data:image\/(?:avif|gif|jpeg|jpg|png|webp);/i;

const attributeNamespace = (name: string): AttributeNamespace => {
  const lowerName = name.toLowerCase();

  if (lowerName === "xlink:href") {
    return "svg-xlink";
  }

  if (lowerName === "xml:lang" || lowerName === "xml:space") {
    return "xml";
  }

  return "html";
};

export const readAttributeValue = (element: Element, name: string): string | null => {
  switch (attributeNamespace(name)) {
    case "svg-xlink":
      return element.getAttributeNS(SVG_XLINK_NAMESPACE, "href") ?? element.getAttribute(name);
    case "xml":
      return element.getAttributeNS(XML_NAMESPACE, name.slice("xml:".length));
    case "html":
      return element.getAttribute(name);
  }
};

export const applyAttributeValue = (element: Element, name: string, value: string | null): void => {
  switch (attributeNamespace(name)) {
    case "svg-xlink":
      if (value === null) {
        element.removeAttributeNS(SVG_XLINK_NAMESPACE, "href");
        element.removeAttribute(name);
      } else {
        element.setAttributeNS(SVG_XLINK_NAMESPACE, name, value);
      }
      return;
    case "xml": {
      const localName = name.slice("xml:".length);
      if (value === null) {
        element.removeAttributeNS(XML_NAMESPACE, localName);
        element.removeAttribute(name);
      } else {
        element.setAttributeNS(XML_NAMESPACE, name, value);
      }
      return;
    }
    case "html":
      if (value === null) {
        element.removeAttribute(name);
      } else {
        element.setAttribute(name, value);
      }
  }
};

const validateUrlAttributeValue = (element: Element, name: string, value: string): void => {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0 || trimmedValue.startsWith("#")) {
    return;
  }

  if (name.toLowerCase() === "srcset") {
    for (const candidate of trimmedValue.split(",")) {
      const [urlCandidate] = candidate.trim().split(/\s+/, 1);

      if (urlCandidate !== undefined && urlCandidate.length > 0) {
        validateUrlAttributeValue(element, "src", urlCandidate);
      }
    }
    return;
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmedValue, element.ownerDocument.baseURI);
  } catch {
    throw new Error(`Enter a valid URL for ${name}.`);
  }

  const lowerName = name.toLowerCase();
  const isLink = lowerName === "href" || lowerName === "xlink:href" || lowerName === "cite";

  if (parsed.protocol === "data:") {
    if (!SAFE_DATA_IMAGE_PATTERN.test(trimmedValue)) {
      throw new Error(`Only safe data image URLs are allowed for ${name}.`);
    }
    return;
  }

  const allowedProtocols = isLink ? SAFE_HREF_PROTOCOLS : SAFE_RESOURCE_PROTOCOLS;

  if (!allowedProtocols.has(parsed.protocol)) {
    throw new Error(`The ${parsed.protocol} protocol is not allowed for ${name}.`);
  }
};

export const validateAttributeChange = (
  element: Element,
  name: string,
  value: string | null,
): void => {
  const lowerName = name.toLowerCase();

  if (name.length === 0 || /[\s"'<>/=]/.test(name)) {
    throw new Error("Enter a valid attribute name.");
  }

  if (/^on[a-z]/i.test(name)) {
    throw new Error("Event-handler attributes are blocked for safety.");
  }

  if (value !== null && URL_ATTRIBUTES.has(lowerName)) {
    validateUrlAttributeValue(element, lowerName, value);
  }
};
