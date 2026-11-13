/**
 * data/reviewCorpus.js
 * Kho ngữ liệu mẫu câu tiếng Việt phong phú để sinh 400 review thực tế:
 * - 5 khía cạnh x 3 cực tính (pos, neg, neu) với tối thiểu 20 cụm từ khác nhau cho mỗi ô.
 * - Đầy đủ các văn phong: trang trọng, đời thường, teencode, không dấu, giọng Bắc, giọng Nam, ngắn, dài.
 * - Cơ chế inject nhiễu: lỗi gõ telex, kéo dài ký tự, emoji, từ đệm.
 * - Ca khó: câu trái chiều (nhưng/tuy nhiên), phủ định ("không đắt"), phủ định kép, mỉa mai nhẹ.
 * - Review chung chung (~15% không nhắc khía cạnh).
 */

const ASPECT_LEXICON = {
  quality: {
    pos: [
      'tay nghề rất cao',
      'chuyên môn xuất sắc',
      'code cực kỳ chuẩn chỉ',
      'giao diện đẹp mắt sắc sảo',
      'dọn dẹp sạch bóng không tì vết',
      'sửa chữa dứt điểm không bị lại',
      'bài viết sâu sắc chuẩn SEO',
      'kiến thức sâu rộng giảng dạy cuốn hút',
      'thiết kế sáng tạo độc đáo',
      'kỹ năng chuyên nghiệp',
      'chất lượng dịch vụ hoàn hảo',
      'chất lượng tuyệt vời ngoài mong đợi',
      'làm rất kỹ và tỉ mỉ',
      'thực sự có trình độ cao',
      'sản phẩm bàn giao rất ưng ý',
      'kết quả vượt xa kỳ vọng',
      'trình độ chuyên môn giỏi',
      'tay nghề đỉnh chóp',
      'làm đâu ra đấy rất bài bản',
      'chất lượng đỉnh cao không có gì để chê',
      'làm việc rất có gu và thẩm mỹ',
      'năng lực chuyên môn đáng nể'
    ],
    neg: [
      'tay nghề còn non',
      'chất lượng rất kém',
      'làm qua loa đại khái',
      'code nhiều lỗi bug',
      'giao diện thô và xấu',
      'dọn dẹp bẩn thỉu sơ sài',
      'sửa xong vài hôm lại hỏng',
      'bài viết nông cạn nhạt nhẽo',
      'dạy học không hiệu quả',
      'thiết kế đạo nhái thiếu sáng tạo',
      'chất lượng không như quảng cáo',
      'làm ăn cẩu thả vô trách nhiệm',
      'kỹ năng quá yếu kém',
      'kết quả rất thất vọng',
      'làm việc thiếu chuyên nghiệp',
      'trình độ còn quá non nớt',
      'sản phẩm bàn giao lỗi tùm lum',
      'chất lượng dưới mức trung bình',
      'tiền mất tật mang chất lượng quá tệ',
      'làm việc chắp vá không ra hồn',
      'kém cỏi không đúng với kỳ vọng'
    ],
    neu: [
      'chất lượng ở mức chấp nhận được',
      'tay nghề tạm ổn vừa phải',
      'không quá xuất sắc nhưng dùng được',
      'chất lượng bình thường',
      'làm tròn vai chưa có gì đột phá',
      'ở mức trung bình khá',
      'đáp ứng được nhu cầu cơ bản',
      'chất lượng gọi là tàm tạm',
      'không hay cũng không dở',
      'đủ tiêu chuẩn căn bản',
      'chất lượng vừa vặn số tiền',
      'không có gì quá ấn tượng',
      'làm tạm được tạm ổn',
      'chất lượng tương đối',
      'mức độ hoàn thiện ở mức vừa phải',
      'trình độ vừa tầm không quá nổi trội'
    ]
  },

  price: {
    pos: [
      'giá cả rất hợp lý',
      'chi phí rẻ bất ngờ',
      'giá hạt dẻ phù hợp sinh viên',
      'mức giá cực kỳ cạnh tranh',
      'đáng đồng tiền bát gạo',
      'giá mềm hơn nhiều nơi khác',
      'chi phí quá hời cho chất lượng này',
      'giá cả phải chăng',
      'chi phí tiết kiệm tối đa',
      'giá rẻ giật mình',
      'giá tốt nhất thị trường',
      'báo giá rất minh bạch và rẻ',
      'chi phí quá êm ví',
      'giá cả quá tốt',
      'rẻ mà chất lượng',
      'mức giá quá đẹp',
      'không bị chặt chém lấy giá rất mềm',
      'chi phí cực kỳ dễ chịu',
      'giá bình dân ai cũng thuê được',
      'mức chi phí quá là tiết kiệm'
    ],
    neg: [
      'giá quá đắt đỏ',
      'chi phí quá chát',
      'giá cắt cổ so với thị trường',
      'quá tốn kém không đáng',
      'lấy giá trên trời',
      'giá cao ngất ngưởng',
      'chi phí phát sinh đắt đỏ',
      'giá không tương xứng chất lượng',
      'báo giá chát chúa',
      'chi phí quá cao',
      'quá đắt đỏ so với mặt bằng chung',
      'giá cao vút',
      'quá chát ví xót cả ruột',
      'lấy giá quá cao không hợp lý',
      'chi phí vượt quá ngân sách',
      'bị đội giá lên nhiều',
      'đắt xắt ra miếng nhưng hơi buốt ví',
      'giá đắt gấp đôi nơi khác',
      'hơi bị chặt chém về giá cả',
      'mức giá quá cao so với kết quả nhận được'
    ],
    neu: [
      'giá cả ở mức trung bình',
      'chi phí bình thường theo thị trường',
      'mức giá vừa phải không rẻ không đắt',
      'giá đúng với mặt bằng chung',
      'chi phí chấp nhận được',
      'giá cả tương đương các bên khác',
      'không quá đắt cũng chẳng quá rẻ',
      'mức giá sàn tiêu chuẩn',
      'chi phí vừa vặn ngân sách',
      'giá tầm trung',
      'mức giá phổ thông',
      'chi phí ngang ngửa thị trường',
      'giá cả hợp lý vừa tầm',
      'mức giá tàm tạm',
      'chi phí ở mức trung bình vừa phải',
      'giá không chênh lệch nhiều'
    ]
  },

  speed: {
    pos: [
      'hoàn thành siêu nhanh',
      'bàn giao trước thời hạn',
      'đúng giờ từng phút',
      'tốc độ làm việc thần tốc',
      'có mặt chỉ sau 15 phút',
      'rất nhanh nhẹn và khẩn trương',
      'tiến độ chuẩn chỉ không trễ một giây',
      'xử lý tức thì trong nháy mắt',
      'tốc độ xử lý siêu tốc',
      'không để khách phải đợi lâu',
      'làm việc rất mau lẹ',
      'tiến độ cực kỳ nhanh chóng',
      'bàn giao đúng hẹn',
      'nhanh như một cơn gió',
      'tác phong làm việc nhanh thoăn thoắt',
      'xong sớm hơn dự kiến',
      'rất khẩn trương và chuẩn giờ',
      'làm việc năng suất tiến độ vù vù',
      'chuẩn chỉ về mặt thời gian',
      'nhanh gọn lẹ không mất thời gian'
    ],
    neg: [
      'làm việc quá chậm chạp',
      'trễ deadline liên miên',
      'cao su giờ giấc cả tiếng đồng hồ',
      'chậm như rùa bò',
      'hẹn lần hẹn lượt mãi mới xong',
      'chờ đợi mòn mỏi mất thời gian',
      'bàn giao trễ hạn nhiều ngày',
      'tác phong lề mề chậm tiến độ',
      'quá chậm trễ gây ảnh hưởng công việc',
      'hoãn đi hoãn lại mãi',
      'hẹn một đằng làm một nẻo về giờ giấc',
      'mãi không xong sốt cả ruột',
      'chờ đợi sốt ruột cả ngày',
      'rất chậm chạp thiếu tôn trọng thời gian',
      'tiến độ ì ạch như sên',
      'lề mề câu giờ quá mức',
      'trễ hẹn mà không thèm báo trước',
      'làm ăn chậm chạp ngâm việc quá lâu',
      'quá lề mề mất cả buổi sáng',
      'chậm trễ làm lỡ hết kế hoạch của mình'
    ],
    neu: [
      'tiến độ ở mức bình thường',
      'thời gian hoàn thành vừa đủ',
      'không quá nhanh cũng không quá trễ',
      'giao việc đúng theo thỏa thuận ban đầu',
      'tốc độ tàm tạm',
      'thời gian đáp ứng vừa phải',
      'tiến độ trung bình',
      'không bị trễ nhưng cũng không sớm',
      'thời gian hoàn tất tạm ổn',
      'tốc độ vừa phải',
      'bàn giao vừa kịp hạn',
      'không quá vội vàng túc tắc làm',
      'tiến độ tàm tạm chấp nhận được',
      'thời gian xử lý vừa tầm',
      'tốc độ làm việc ở mức vừa phải',
      'tiến độ ở mức chấp nhận được'
    ]
  },

  attitude: {
    pos: [
      'thái độ cực kỳ nhiệt tình',
      'giao tiếp rất lễ phép và nhã nhặn',
      'vui vẻ thân thiện cởi mở',
      'tư vấn rất chu đáo tận tâm',
      'chăm sóc khách hàng điểm 10',
      'rất kiên nhẫn lắng nghe yêu cầu',
      'thái độ chuyên nghiệp và tôn trọng khách',
      'cực kỳ hòa nhã dễ thương',
      'nhiệt huyết hết mình vì khách',
      'ăn nói lịch sự nhẹ nhàng',
      'phục vụ chu đáo từ A đến Z',
      'thân thiện như người nhà',
      'hỗ trợ cực kỳ có tâm',
      'tác phong nhã nhặn chu đáo',
      'giao tiếp rất có văn hóa',
      'rất dễ thương và biết lắng nghe',
      'niềm nở vui vẻ từ đầu đến cuối',
      'tính tình xởi lởi hòa đồng',
      'tư vấn cặn kẽ không nề hà',
      'rất chu đáo ân cần'
    ],
    neg: [
      'thái độ cộc cằn khó chịu',
      'ăn nói xấc xược coi thường khách',
      'mặt mày cau có gắt gỏng',
      'giao tiếp trịch thượng thiếu tôn trọng',
      'hỏi thì gắt gỏng không thèm trả lời',
      'thái độ rất lồi lõm vô trách nhiệm',
      'nói chuyện nhát gừng khó chịu',
      'vô lễ và thiếu lịch sự',
      'coi thường ý kiến của khách',
      'thái độ phục vụ quá tệ hại',
      'cực kỳ khó tính và gắt gỏng',
      'nói chuyện xách mé',
      'bực bội vì thái độ phục vụ',
      'không có chút thiện chí nào',
      'thái độ lấc cấc làm mình rất ức chế',
      'cáu gắt với khách hàng',
      'ăn nói thô lỗ khó nghe',
      'thái độ trịch thượng làm như ban ơn',
      'nói chuyện cộc lốc vô phép',
      'quá xem thường khách hàng'
    ],
    neu: [
      'thái độ bình thường',
      'giao tiếp vừa đủ không mặn mà lắm',
      'không niềm nở nhưng cũng không thô lỗ',
      'chỉ trao đổi đúng chuyên môn',
      'thái độ công việc thuần túy',
      'không quá thân thiện nhưng chấp nhận được',
      'nói chuyện bình thường',
      'tác phong trung tính',
      'không quá vồn vã',
      'thái độ ở mức trung bình',
      'cư xử vừa phải',
      'giao tiếp vừa đủ hiểu',
      'thái độ chuẩn mực văn phòng',
      'không vồn vã cũng không cáu bẳn',
      'thái độ vừa phải',
      'giao tiếp đúng mực không quá nhiệt tình'
    ]
  },

  warranty: {
    pos: [
      'chế độ bảo hành cực kỳ uy tín',
      'hỗ trợ sau bàn giao rất chu đáo',
      'sẵn sàng sửa lại miễn phí đến khi ưng ý',
      'bảo hành nhanh chóng không trốn tránh',
      'hậu mãi điểm mười',
      'cam kết bảo hành dài hạn',
      'hỗ trợ bảo trì trọn gói rất yên tâm',
      'bảo hành tận nơi không phát sinh chi phí',
      'gọi bảo hành là có mặt ngay',
      'chăm sóc sau dịch vụ cực kỳ tận tâm',
      'sẵn sàng fix lỗi bảo hành nhiệt tình',
      'bảo hành trách nhiệm rõ ràng',
      'hậu mãi chu đáo dài lâu',
      'chế độ hậu mãi quá tốt',
      'bảo hành chuẩn chỉ đúng cam kết',
      'hỗ trợ nhiệt tình ngay cả khi đã thanh toán',
      'cam kết bảo hành có phiếu rõ ràng',
      'chính sách hậu mãi rất có trách nhiệm',
      'hỗ trợ chỉnh sửa phát sinh tận tình',
      'bảo hành uy tín trách nhiệm cao'
    ],
    neg: [
      'bàn giao xong là phủi sạch trách nhiệm',
      'gọi bảo hành thì không thèm nghe máy',
      'không có chế độ bảo hành',
      'hỏng lại gọi thì từ chối hỗ trợ',
      'chế độ hậu mãi như lừa đảo',
      'lấy tiền xong là chặn số khách',
      'đòi thêm tiền mới chịu bảo hành',
      'bảo hành thì chối đây đẩy',
      'không có trách nhiệm sau khi xong việc',
      'đem con bỏ chợ',
      'hậu mãi cực kỳ tệ',
      'gọi bảo hành cả tuần không thấy đâu',
      'trốn tránh trách nhiệm bảo hành',
      'nói một đằng làm một nẻo về bảo hành',
      'chế độ bảo hành chỉ là nói mồm',
      'nhận tiền xong coi như hết việc',
      'từ chối sửa lại lỗi đã cam kết',
      'hậu mãi vô trách nhiệm',
      'chính sách bảo hành quá tệ bạc',
      'phủi tay ngay sau khi nhận tiền'
    ],
    neu: [
      'bảo hành ở mức cơ bản',
      'hỗ trợ sửa lại theo đúng hợp đồng',
      'chế độ hậu mãi tiêu chuẩn',
      'có hỗ trợ chỉnh sửa nhẹ',
      'bảo hành theo quy định của sàn',
      'hậu mãi vừa đủ',
      'chỉ hỗ trợ trong thời gian ngắn',
      'bảo hành ở mức trung bình',
      'hỗ trợ kỹ thuật căn bản',
      'bảo hành tạm được',
      'chế độ hậu mãi bình thường',
      'có bảo hành nhưng thủ tục hơi lâu',
      'hỗ trợ sau bán hàng tạm ổn',
      'chính sách bảo hành cơ bản',
      'hậu mãi đúng cam kết tối thiểu',
      'hỗ trợ vừa đủ trong phạm vi cam kết'
    ]
  }
};

const GENERIC_REVIEWS = [
  { text: 'Dịch vụ của sàn SkillRental rất tuyệt vời, trải nghiệm nhìn chung rất hài lòng.', sentiment: 'positive', rating: 5 },
  { text: 'Trải nghiệm sử dụng dịch vụ rất tốt, mình sẽ tiếp tục ủng hộ lần sau.', sentiment: 'positive', rating: 5 },
  { text: 'Mọi thứ diễn ra rất thuận lợi, không có gì để phàn nàn cả.', sentiment: 'positive', rating: 5 },
  { text: 'Cảm ơn chuyên gia, rất hài lòng với lần hợp tác này.', sentiment: 'positive', rating: 5 },
  { text: 'Đánh giá 5 sao cho chất lượng dịch vụ tổng thể của sàn.', sentiment: 'positive', rating: 5 },
  { text: 'Rất ưng ý, dịch vụ chuyên nghiệp và uy tín.', sentiment: 'positive', rating: 5 },
  { text: 'Mọi thứ đều ổn, xứng đáng để trải nghiệm nhiều lần.', sentiment: 'positive', rating: 4 },
  { text: 'Dịch vụ ở mức bình thường, dùng tạm được.', sentiment: 'neutral', rating: 3 },
  { text: 'Trải nghiệm tàm tạm, không có gì quá nổi trội hay đặc sắc.', sentiment: 'neutral', rating: 3 },
  { text: 'Tạm ổn, đúng với mong đợi cơ bản.', sentiment: 'neutral', rating: 3 },
  { text: 'Dịch vụ ở mức vừa phải, có thể cân nhắc nếu cần.', sentiment: 'neutral', rating: 3 },
  { text: 'Mọi thứ trung bình, chưa thấy điểm nhấn ấn tượng.', sentiment: 'neutral', rating: 3 },
  { text: 'Quá thất vọng với lần trải nghiệm này, không bao giờ quay lại.', sentiment: 'negative', rating: 1 },
  { text: 'Dịch vụ cực kỳ tệ hại, khuyên mọi người nên né xa.', sentiment: 'negative', rating: 1 },
  { text: 'Trải nghiệm rất bực mình, quá phí thời gian và tiền bạc.', sentiment: 'negative', rating: 1 },
  { text: 'Rất không hài lòng, sàn cần xem xét lại chất lượng đối tác.', sentiment: 'negative', rating: 2 },
  { text: 'Trải nghiệm dịch vụ không như mong đợi, khá là tệ.', sentiment: 'negative', rating: 2 },
  { text: 'Dịch vụ tạm ổn, không xuất sắc nhưng chấp nhận được trong tầm tiền.', sentiment: 'neutral', rating: 3 },
  { text: 'Nhìn chung là dùng được, không có vấn đề gì nghiêm trọng.', sentiment: 'neutral', rating: 3 },
  { text: 'Đã nhận bàn giao đầy đủ, cảm ơn sàn và bạn chuyên gia nhiều nhé.', sentiment: 'positive', rating: 5 }
];

const TRICKY_PATTERNS = [
  {
    template: 'Không thể nói là không hài lòng, {aspect_pos} mà {aspect_pos_2}.',
    type: 'double_negation',
    sentiment: 'positive',
    rating: 5
  },
  {
    template: 'Chẳng có điểm nào để chê cả, {aspect_pos}.',
    type: 'double_negation',
    sentiment: 'positive',
    rating: 5
  },
  {
    template: 'Nhanh như rùa bò thế này thì chết dở, {aspect_neg}.',
    type: 'sarcasm',
    sentiment: 'negative',
    rating: 1
  },
  {
    template: 'Đúng là đắt xắt ra miếng, {aspect_neg_price} nhưng {aspect_pos_quality}.',
    type: 'sarcasm_contrast',
    sentiment: 'mixed',
    rating: 4
  },
  {
    template: 'Tưởng thế nào, ai ngờ {aspect_neg}, quá chán nản.',
    type: 'sarcasm',
    sentiment: 'negative',
    rating: 1
  },
  {
    template: 'Không thể không khen ngợi được, {aspect_pos}!',
    type: 'double_negation',
    sentiment: 'positive',
    rating: 5
  }
];

const CONTRAST_CONNECTORS = [
  'nhưng',
  'tuy nhiên',
  'bù lại',
  'cơ mà',
  'có điều',
  'được cái',
  'mặc dù vậy'
];

const INTENSIFIERS = [
  'cực kỳ',
  'rất',
  'quá là',
  'siêu',
  'hết sức',
  'vô cùng',
  'khá là'
];

const FILLERS = [
  'nói chung là',
  'thực sự thì',
  'nhìn chung',
  'theo cảm nhận của mình thì',
  'nói thật lòng',
  'đánh giá khách quan thì',
  'phải công nhận là'
];

const EMOJIS_POS = ['👍', '⭐', '👏', '🔥', '💯', '😊', '❤️', '🎉', '🥰'];
const EMOJIS_NEG = ['😡', '👎', '💔', '😤', '🤦‍♂️', '🙄', '❌'];
const EMOJIS_NEU = ['😐', '🤔', '👌'];

module.exports = {
  ASPECT_LEXICON,
  GENERIC_REVIEWS,
  TRICKY_PATTERNS,
  CONTRAST_CONNECTORS,
  INTENSIFIERS,
  FILLERS,
  EMOJIS_POS,
  EMOJIS_NEG,
  EMOJIS_NEU
};
