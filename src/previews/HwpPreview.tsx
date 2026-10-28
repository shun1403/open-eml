import { useMemo } from 'react';
import { readHwp, readHwpx, type HwpPreview as HwpContent } from '../core/hwp';
import type { AttachmentNode } from '../core/types';
import { useObjectUrl } from '../components/useObjectUrls';

export default function HwpPreview({ node, format }: { node: AttachmentNode; format: 'hwp' | 'hwpx' }) {
  const result = useMemo((): { content?: HwpContent; error?: boolean } => {
    try {
      return { content: format === 'hwp' ? readHwp(node.content) : readHwpx(node.content) };
    } catch {
      return { error: true };
    }
  }, [node, format]);

  const image = result.content?.previewImage;
  const imageNode = useMemo(
    () => (image ? { ...node, mimeType: image.mimeType, content: image.content } : null),
    [node, image],
  );
  const imageUrl = useObjectUrl(imageNode);

  if (result.error || !result.content) {
    return <p className="muted preview-message">한글 문서를 열지 못했습니다. 내려받아 확인하세요.</p>;
  }
  const { paragraphs, limited } = result.content;
  return (
    <div className="hwp-preview">
      <p className="muted preview-note">
        {limited === 'distribution'
          ? '배포용 문서라 본문 대신 문서에 저장된 미리보기 글만 보여줍니다.'
          : limited === 'encrypted'
            ? '암호가 걸린 문서라 미리보기 글만 보여줍니다.'
            : '글자만 간단히 보여줍니다. 원래 모양은 내려받아 한글에서 확인하세요.'}
      </p>
      {imageUrl && <img className="hwp-thumbnail" src={imageUrl} alt="첫 쪽 미리보기" />}
      <div className="hwp-text">
        {paragraphs.map((text, index) => (text.trim() ? <p key={index}>{text}</p> : <br key={index} />))}
      </div>
    </div>
  );
}
