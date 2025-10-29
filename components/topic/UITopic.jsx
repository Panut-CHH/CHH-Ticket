import React from "react";

export default function UITopic({ topic }) {
  return (
    <>
      <div className="flex items-center justify-start w-full p-1.5 gap-1 text-lg border-b-1 border-light-foreground dark:border-dark-foreground">
        {topic}
      </div>
    </>
  );
}
