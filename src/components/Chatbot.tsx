import React from "react";
import {
  Container,
  Paper,
  TextField,
  IconButton,
  Box,
  Typography,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Rating,
  CircularProgress,
  Fab,
  Tooltip,
} from "@mui/material";
import { styled } from "@mui/system";
import {
  IoSend,
  IoTrashBinOutline,
  IoThumbsUp,
  IoThumbsDown,
} from "react-icons/io5";
import { format } from "date-fns";
import { v4 as uuidv4 } from "uuid"; // For generating unique messageId
import LeiaIcon from "../assets/Leia.png";
import ProfileIcon from "../assets/profile-58-512.png";
import Linkify from "react-linkify";
import { BiDownload } from "react-icons/bi";
import Swal from "sweetalert2";

/**
 * Each message in the chat has:
 * - localId: unique number in React (for rendering only).
 * - conversationId: PK in DynamoDB.
 * - messageId: SK in DynamoDB (UUID).
 * - timestamp: string (ISO) for display.
 * - text: message text.
 * - isUser: true if it's a user message, false if bot.
 * - feedback: "up" | "down" | "".
 * - comment: text feedback if negative, etc.
 * - rating: numeric rating (1–10).
 * - agentAliasId: optional extra field from your LLM API.
 */
interface ChatMessage {
  localId: number;
  conversationId: string;
  messageId: string;
  timestamp: string;
  text: string;
  isUser: boolean;
  feedback: "up" | "down" | "";
  comment: string;
  rating?: number | null;
  agentAliasId?: string;
}

const BACKEND_URL = "https://2lvum8mh59.execute-api.us-east-1.amazonaws.com";

/** Default greeting from the bot. */
const createDefaultBotMessage = (): ChatMessage => ({
  localId: 1,
  conversationId: "",
  messageId: uuidv4(),
  timestamp: new Date().toISOString(),
  text: "Hi, I am Leia. How can I assist you today?",
  isUser: false,
  feedback: "",
  comment: "",
  rating: null,
});

/** Generate a unique conversation ID for each page load. */
const generateConversationId = () => {
  return (
    "conversation_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)
  );
};

/**
 * Styled wrappers
 */
const ContainerWrapper = styled("div")({
  position: "relative",
});

const ExportButton = styled(Fab)({
  position: "absolute",
  top: "20px",
  right: "20px",
  zIndex: 10,
});

const ChatContainer = styled(Container)(({ theme }) => ({
  height: "95vh",
  minWidth: "95vw",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  padding: "25px",
  backgroundColor: "#f5f5f5",
  borderRadius: "10px",
  margin: theme.spacing(2),
  boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
}));

const MessageContainer = styled(Box)({
  flexGrow: 1,
  overflow: "auto",
  marginBottom: "16px",
  padding: "16px",
  "&::-webkit-scrollbar": {
    display: "none",
  },
  "-ms-overflow-style": "none",
  "scrollbar-width": "none",
});

const MessageBubble = styled(Paper)<{ isUser: boolean }>(({ isUser }) => ({
  padding: "12px 16px",
  margin: "8px 0",
  maxWidth: "70%",
  borderRadius: "10px",
  backgroundColor: isUser ? "#1e233b" : "#ffffff",
  color: isUser ? "#ffffff" : "#000000",
  marginLeft: isUser ? "auto" : "0",
  marginRight: isUser ? "0" : "auto",
  boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
  overflowWrap: "break-word",
}));

const InputContainer = styled(Box)({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "16px",
  backgroundColor: "#ffffff",
  borderRadius: "12px",
  boxShadow: "0 -2px 4px rgba(0, 0, 0, 0.1)",
});

/** The main Chatbot component */
const Chatbot = () => {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    createDefaultBotMessage(),
  ]);
  const [inputText, setInputText] = React.useState("");
  const [isThinking, setIsThinking] = React.useState(false);
  const [conversationId, setConversationId] = React.useState<string>("");

  // For feedback dialog
  const [showModal, setShowModal] = React.useState(false);
  const [feedbackComment, setFeedbackComment] = React.useState("");
  const [feedbackRating, setFeedbackRating] = React.useState<number | null>(5);
  const [selectedLocalId, setSelectedLocalId] = React.useState<number | null>(
    null
  );

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  /** On mount, generate a random conversationId. */
  React.useEffect(() => {
    const randomId = generateConversationId();
    setConversationId(randomId);
  }, []);

  /** Fetch conversation from DynamoDB */
  React.useEffect(() => {
    const fetchMessages = async () => {
      if (!conversationId) return; // skip if we haven't set it yet
      try {
        const response = await fetch(
          `${BACKEND_URL}/messages?conversationId=${conversationId}`
        );
        const data = await response.json();

        let newMessages = data.map((item: any, index: number) => ({
          localId: index + 2,
          conversationId: item.conversationId,
          messageId: item.messageId,
          timestamp: item.timestamp,
          text: item.text,
          isUser: item.isUser,
          feedback: item.feedback || "",
          comment: item.comment || "",
          rating: item.rating ? Number(item.rating) : null,
          agentAliasId: item.agentAliasId || "",
        })) as ChatMessage[];

        // Sort by timestamp if desired
        newMessages = newMessages.sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        setMessages([createDefaultBotMessage()].concat(newMessages));
      } catch (error) {
        console.error("Fetch error:", error);
      }
    };

    fetchMessages();
  }, [conversationId]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  /**
   * Export CSV
   * - We'll build a CSV with columns like [localId, time, user/bot, text, feedback, comment, rating].
   */
  const handleExportCsv = () => {
    const header = [
      "LocalId",
      "Timestamp",
      "UserOrBot",
      "Text",
      "Feedback",
      "Comment",
      "Rating",
    ];
    const rows = messages.map((msg) => [
      msg.localId,
      msg.timestamp,
      msg.isUser ? "User" : "Bot",
      `"${msg.text?.replace(/"/g, '""')}"`, // handle quotes
      msg.feedback,
      msg.comment,
      msg.rating ?? "",
    ]);

    const csvContent = [header.join(","), ...rows.map((r) => r.join(","))].join(
      "\n"
    );

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${conversationId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /** Thumbs up/down open the same dialog */
  const handleOpenFeedbackDialog = (
    localId: number,
    newFeedback: "up" | "down"
  ) => {
    setSelectedLocalId(localId);
    setShowModal(true);
    setFeedbackRating(newFeedback === "up" ? 10 : 1);
    setFeedbackComment("");

    // Update local feedback
    setMessages((prev) =>
      prev.map((m) =>
        m.localId === localId ? { ...m, feedback: newFeedback } : m
      )
    );
  };

  const handleThumbUpClick = (localId: number) => {
    handleOpenFeedbackDialog(localId, "up");
  };
  const handleThumbDownClick = (localId: number) => {
    handleOpenFeedbackDialog(localId, "down");
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setFeedbackComment("");
    setFeedbackRating(5);
    setSelectedLocalId(null);
  };

  const handleSubmitFeedback = async () => {
    if (selectedLocalId == null) {
      handleCloseModal();
      return;
    }

    setMessages((prev) =>
      prev.map((m) =>
        m.localId === selectedLocalId
          ? { ...m, comment: feedbackComment, rating: feedbackRating }
          : m
      )
    );

    const message = messages.find((m) => m.localId === selectedLocalId);
    if (message) {
      try {
        await fetch(`${BACKEND_URL}/messages`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: message.conversationId,
            messageId: message.messageId,
            feedback: message.feedback,
            comment: feedbackComment,
            rating: feedbackRating,
          }),
        });
      } catch (error) {
        console.error("Update feedback error:", error);
      }
    }
    handleCloseModal();
  };

  /** Send user message, then get bot reply */
  const handleSend = async () => {
    if (!inputText.trim() || !conversationId) return;

    const newLocalId = messages.length
      ? Math.max(...messages.map((m) => m.localId)) + 1
      : 1;
    const newMessageId = uuidv4();
    const msgTimestamp = new Date().toISOString();

    const userMessage: ChatMessage = {
      localId: newLocalId,
      conversationId,
      messageId: newMessageId,
      timestamp: msgTimestamp,
      text: inputText,
      isUser: true,
      feedback: "",
      comment: "",
    };

    // Local update
    setMessages((prev) => [...prev, userMessage]);

    // Post user msg
    try {
      await fetch(`${BACKEND_URL}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userMessage),
      });
    } catch (error) {
      console.error("Send user message error:", error);
    }

    setInputText("");
    setIsThinking(true);

    // Bot LLM
    let botReplyText = "Sorry, no response";
    let agentAliasId = "";
    try {
      const llmResponse = await fetch(
        "https://1rvd8ntcx2.execute-api.us-east-1.amazonaws.com/v1/conversation",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: inputText,
            sessionId: conversationId,
          }),
        }
      );
      const llmData = await llmResponse.json();
      botReplyText = llmData.response;
      agentAliasId = llmData.agentAliasId;
    } catch (error) {
      console.error("LLM API error:", error);
      botReplyText = "Error getting answer from LLM API.";
    }

    const botLocalId = newLocalId + 1;
    const botMsgId = uuidv4();
    const botTimestamp = new Date().toISOString();

    const botMessage: ChatMessage = {
      localId: botLocalId,
      conversationId,
      messageId: botMsgId,
      timestamp: botTimestamp,
      text: botReplyText,
      isUser: false,
      feedback: "",
      comment: "",
      rating: null,
      agentAliasId,
    };

    setMessages((prev) => [...prev, botMessage]);

    // Post bot msg
    try {
      await fetch(`${BACKEND_URL}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(botMessage),
      });
    } catch (error) {
      console.error("Send bot message to DB error:", error);
    }

    setIsThinking(false);
  };

  const handleClear = () => {
    if (!messages.some((msg) => msg.isUser)) return;

    Swal.fire({
      title: "Clear this conversation?",
      text: "All messages from this session will be deleted. You can export them first if you want.",
      icon: "warning",
      showDenyButton: true,
      showCancelButton: false,
      showCloseButton: true,
      confirmButtonColor: "#c40000",
      confirmButtonText: "Clear only",
      denyButtonColor: "#00a02c",
      denyButtonText: "Export & Clear",
      reverseButtons: true,
      allowOutsideClick: true,
      allowEscapeKey: true,
      customClass: {
        popup: "my-swal-font",
      },
    }).then((result) => {
      if (result.isConfirmed) {
        // Just clear
        setInputText("");
        setMessages([createDefaultBotMessage()]);
        setConversationId(generateConversationId());
      } else if (result.isDenied) {
        // Export and then clear
        handleExportCsv();
        setInputText("");
        setMessages([createDefaultBotMessage()]);
        setConversationId(generateConversationId());
      }
      // If cancelled or outside click, do nothing
    });
  };

  /** Press Enter to send */
  const handleKeyPress = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <ContainerWrapper>
      {/* The export button in top-right corner */}
      <Tooltip
        title="Export conversation and feedback to CSV"
        placement="left"
        arrow
      >
        <ExportButton
          color="primary"
          aria-label="export"
          size="small"
          onClick={handleExportCsv}
        >
          <BiDownload />
        </ExportButton>
      </Tooltip>

      <ChatContainer>
        <MessageContainer>
          {messages.map((message, idx) => (
            <Box
              key={message.localId}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: message.isUser ? "flex-end" : "flex-start",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "flex-end",
                  gap: !message.isUser ? 1 : 0,
                }}
              >
                {!message.isUser && (
                  <Avatar
                    sx={{
                      width: 38,
                      height: 38,
                      backgroundColor: "#f5f5f5",
                    }}
                    src={LeiaIcon}
                  />
                )}

                <MessageBubble isUser={message.isUser}>
                  <Linkify
                    componentDecorator={(href, text, key) => (
                      <a
                        href={href}
                        key={key}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#1976d2" }}
                      >
                        {text}
                      </a>
                    )}
                  >
                    <Typography variant="body1">{message.text}</Typography>
                  </Linkify>
                  <Box
                    sx={{
                      display: "flex",
                      gap: 1,
                      justifyContent: "space-between",
                    }}
                  >
                    {idx !== 0 && (
                      <Typography
                        variant="caption"
                        sx={{ display: "block", mt: 0.5, opacity: 0.7 }}
                      >
                        {format(new Date(message.timestamp), "HH:mm")}
                      </Typography>
                    )}

                    {/* Thumbs for bot messages except the first greeting */}
                    {!message.isUser && idx !== 0 && (
                      <Box>
                        <IconButton
                          size="small"
                          onClick={() => handleThumbUpClick(message.localId)}
                          aria-label="Thumbs up"
                          color={
                            message.feedback === "up" ? "success" : "default"
                          }
                        >
                          <IoThumbsUp />
                        </IconButton>

                        <IconButton
                          size="small"
                          onClick={() => handleThumbDownClick(message.localId)}
                          aria-label="Thumbs down"
                          color={
                            message.feedback === "down" ? "error" : "default"
                          }
                        >
                          <IoThumbsDown />
                        </IconButton>
                      </Box>
                    )}
                  </Box>

                  {/* Show rating/comment if available */}
                  {message.rating && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: "inline-flex", // use inline‐flex
                        alignItems: "center",
                        gap: "4px", // small space between label & stars
                        whiteSpace: "nowrap", // prevent line breaks
                        mt: 0.5,
                        fontStyle: "italic",
                      }}
                    >
                      Rating:
                      <Rating
                        value={message.rating}
                        readOnly
                        size="small"
                        max={10}
                      />
                    </Typography>
                  )}
                  {message.comment && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        mt: 0.5,
                        fontStyle: "italic",
                      }}
                    >
                      Feedback: {message.comment}
                    </Typography>
                  )}
                </MessageBubble>

                {message.isUser && (
                  <Avatar
                    sx={{
                      width: 38,
                      height: 38,
                      backgroundColor: "#f5f5f5",
                    }}
                    src={ProfileIcon}
                  />
                )}
              </Box>
            </Box>
          ))}
          {isThinking && (
            <Typography
              variant="caption"
              sx={{ ml: 2, color: "text.secondary" }}
            >
              <Box display="flex" gap="10px" alignItems="center">
                <span>Leia is thinking</span>
                <CircularProgress size="10px" />
              </Box>
            </Typography>
          )}
          <div ref={messagesEndRef} />
        </MessageContainer>

        {/* Input field */}
        <InputContainer>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Type your message..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyPress}
            multiline
            maxRows={4}
            sx={{ backgroundColor: "#ffffff" }}
          />
          <IconButton
            color="primary"
            onClick={handleSend}
            disabled={!inputText.trim()}
            sx={{
              backgroundColor: "#1976d2",
              color: "#ffffff",
              "&:hover": {
                backgroundColor: "#1565c0",
              },
              height: 48,
              width: 48,
            }}
          >
            <IoSend />
          </IconButton>

          <IconButton
            color="error"
            onClick={handleClear}
            disabled={!messages.some((msg) => msg.isUser)}
            sx={{
              backgroundColor: "#e00202",
              color: "#ffffff",
              "&:hover": {
                backgroundColor: "#a30202",
              },
              height: 48,
              width: 48,
            }}
          >
            <IoTrashBinOutline />
          </IconButton>
        </InputContainer>

        {/* Feedback Dialog */}
        <Dialog
          open={showModal}
          onClose={handleCloseModal}
          fullWidth
          maxWidth="lg"
        >
          <DialogTitle>Can you give a feedback about my answer?</DialogTitle>
          <DialogContent>
            <TextField
              fullWidth
              multiline
              rows={10}
              value={feedbackComment}
              onChange={(e) => setFeedbackComment(e.target.value)}
              placeholder="Feedback..."
            />
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                flexDirection: "column",
                alignItems: "center",
                marginTop: 1,
              }}
            >
              <Typography component="legend">Rating</Typography>
              <Rating
                name="customized-10"
                value={feedbackRating || 0}
                max={10}
                onChange={(_, newVal) => {
                  if (newVal) setFeedbackRating(newVal);
                }}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button variant="contained" onClick={handleSubmitFeedback}>
              Send
            </Button>
          </DialogActions>
        </Dialog>
      </ChatContainer>
    </ContainerWrapper>
  );
};

export default Chatbot;
