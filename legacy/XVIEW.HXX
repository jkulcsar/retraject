#ifndef XVIEWH
#define XVIEWH

/*
 Header for the XView-PC graphical user interface. Turbo C/C++/GNU C
 By Antonio Carlos Moreirao de Queiroz - acmq@coe.ufrj.br
 Version 1.0  - 05/07/92
 Version 1.6  - 20/11/93 Large images
 Version 1.6a - 15/04/94 As version 1.6a in Pascal
 Version 1.6b - 30/04/94 The same object files for C or C++
 Version 1.7  - 01/08/94 Compiles also under GNU C (djgpp).

The Borland C/C++ version of the package is formed by the files:
"xview.h", "xview.obj": Interface routines.
"mickey.h", "mickey.obj": Mouse support.
"x_make.exe": Interface editor for Pascal and C.

To compile a program:
- Use Turbo C++ 1.0 or later version. The object files were generated with
  Borland C++ 3.1.
- Open a project with "mickey.obj", "xview.obj", and the C/C++ source files.
- Turn on the linking with the graphics and floating point libraries.
- Set the memory model to "huge".
- The BGI drivers needed may be (are) also of a different version than the
  ones provided for the Turbo Pascal 7.0 version.


Each object uses in the heap:
- "sizeof(xv_widget)" bytes.
- The size of the buffers used in "tty" objects, "bsize"+1.
- If a frame that is in the screen and above another, its image area.
No extra memory is allocated for the items of menus and settings.
********************************************************************************
*/

/*
 * The variables marked "*" are reserved, and shall not be changed.
 * The variables marked "#" are the ones usually initialized at creation.
 * The others can be freely changed.
 */

#ifdef __GNUC__
#include <libbcc.h>
#else
#include <graphics.h>
#endif

#define LOC_MOVE 256
  /* event: mouse moved */
#define LOC_DRAG 257
  /* event: mouse moved with pressed buttons */
#define MS_LEFT 1001
  /* event: left button pressed */
#define MS_MIDDLE 1004
  /* event: middle button pressed */
#define MS_RIGHT 1002
  /* event: right button pressed */
#define MS_BOTH 1003
  /* event: right and left buttons pressed */
#define m_itens 20
  /* maximum number of items in menus and settings (only 16 in settings) */
#define m_chars 59
  /* caracters in strings */
#define mrgx 5
  /* lateral and bottom margins in the windows */
#define mrgy 22
  /* upper margin in the windows */


  typedef	struct	widget	*Xv_opaque;


  typedef	enum
  { text_field,
	real_field,
	int_field
  }				t_field_type;


  typedef	struct	figstruct  			  /* structue for images */
  {
	int blocks;                           /* number of image blocks -1 */
	int fdx, fdy;                         /* dimensions (used by "drawbitmap") */
	unsigned int blocksize,lastblocksize; /* size of the blocks */
	void *v[2001];                        /* allocated until "blocks" */
  }	figstruct;


  typedef	struct	figstruct	*ptrfig;   /* imagem pointer */


  typedef void (*xv_handler)(Xv_opaque obj);


  typedef enum
  {
	frame,
	button,
	textfield,
	setting,
	message,
	canvas,
	tty,
	menu
  } 		xv_package;


  typedef	char	xv_label_type[m_chars+1];


  typedef	struct	widget
  {
	 xv_label_type	xv_label;              /* # title */
	int           	x,y,dx,dy;             /* # position and size */
	int           	fore_color,back_color; /* # colors */
	Xv_opaque     	owner;                 /* * frame where the object is */
	Xv_opaque     	next;                  /* * next objeto */
	Xv_opaque    	menu_name;             /* # associated menu */
	xv_handler    	notify_handler;        /* # notify handler */
	xv_handler   	event_handler;         /* # event handler */
	void          	*client_data;          /* # other associated values */
	xv_package		o_type;                /* * object type */
	union
	{
	 struct
	 {
		 Xv_opaque	over;
		 Xv_opaque	under;        /* * neighbor window frames */
		 ptrfig    	Pw;           /* * covered image */
		 #ifdef __TURBOC__
			  long int areaw;     /* * image size. Used internally */
		 #endif
		 int      	 dxmin, dymin; /* # minimum size */
		 int       	interfere;    /* * used internally */
		 int       	mapped;       /* * if the window is in the screen */
		 int       	adjust_exit;  /* # if the window can ba closed with the central mouse button */
		 Xv_opaque 	mouse_obj;    /* # initial location of the mouse (object), or nil */
		 struct viewporttype gr_out;
	 }	sframe;  				  /* * viewport */


	 struct
	 {
		 int       	icon_label;   /* # if "xv_label" is a bitmap file name */
		 ptrfig    	Pimageb;
	 }	sbutton;  				  /* * button image */


	 struct
	 {
		 int      	icon_msg;     /* # if "xv_label" is a bitmap filename */
		 ptrfig    	Pimagem;
	 }	smessage; 				  /* *  message image */


	 struct
	 {
		xv_label_type	panel_value;    	   /* # text */
		double			panel_real;            /* # corresponding real */
		int				panel_int;         	   /* # corresponding integer */
		int				min_value, max_value;  /* # integer limits */
		int				value_length;          /* # characters shown */
		t_field_type	field_type;
	 }	stextfield; /* type */


	 struct
	 {
		int				itens_setting;      	/* * number of items */
		int      		sel_setting;    	    /* # selection */
		char			*item_setting[m_itens];	/* * item strings */
		int				exclusive;
	 }	ssetting;       /* # if selection is exclusive */


	 struct
	 {
		int				 can_xext,	can_yext;
	 } scanvas;  		/* # if extends to the borders */


	 struct
	 {
		int				tty_xext,tty_yext;       /* # " */
		int				xc,yc;                   /* * graphical cursors */
		unsigned int	bsize;			         /* * buffer size */
		unsigned		bcsr;               	 /* * buffer cursor */
		unsigned		bstart,tstart,tend;		 /* * buffer pointers */
		int				dxtty;                   /* * effective width */
		char*			Pb;
	 } stty;           	/* * text buffer */


	 struct
	 {
		int				itens_menu;           	/* * number of de items */
		int				sel_menu;             	/* # selected item */
		char 			*item_menu[m_itens]; 	/* * item strings */
		Xv_opaque		item_submenu[m_itens];
	 } smenu;  /* # submenus */

   } v;

  } widget;



  extern int 			wallpaper;   /* 0 # if the background is to be retained */
  extern unsigned int 	normal_bsize;  /* # "bsize" (tty) attributed by "xv_create" */
  extern unsigned int 	normal_length; /* # "value_length" (textfield) attributed by "xv_create" */
  extern int 			c_normal;    /* LIGHTGRAY     object background color */
  extern int 			c_active;    /* GREEN         pressed buttons color */
  extern int 			c_light;     /* WHITE         lighted corners color */
  extern int 			c_shadow;    /* BLACK         shadowed corners color */
  extern int 			c_white;     /* WHITE         default "back_color" */
  extern int 			c_black;     /* BLACK         default "fore_color" */
  extern int 			c_overwrite; /* LIGHTRED      overwrite color in textfields */
  extern int 			c_edit;      /* BLUE          edit color in textfields */
  extern int 			c_insert;    /* YELLOW        insert color in textfields */
  extern int 			c_hatch;     /* CYAN          background pattern color */
  extern int 			type_hatch;        /* XHATCH_FILL  background color */
  extern int 			use_palette;       /* 1 if bitmap palettes are accepted */
  extern void 			*normal_client_data; /* NULL attributed to "client_data" by "xv_create" */
  extern int         	nlines;   /* * 60, number of lines per image block */
  extern int          	insert;   /* 1 if textfields are insert mode */
  extern int          	xv_ok;    /* * resultd of the last window operation */
  extern int          	xv_end;   /* terminates "xv_main_loop" */
  extern xv_label_type  ulttxt;    /* last text read in textfields */
  extern int          	ie_locx,ie_locy;   /* * mouse position relative to object */
  extern int          	ie_code;      /* * event code */
  extern int          	ie_shiftcode; /* * mouse buttons state */
  extern Xv_opaque    	active_w;     /* * the active window frame */
  extern Xv_opaque    	active_o;     /* * the active object */
  extern Xv_opaque    	w_base;       /* base frame for "xv_create" */
  extern Xv_opaque    	o_base;       /* base object for "item_create" */
  extern int 			redrawing_frame;       /* if a window is being redrawn */
  extern void 			(*interposer)(void);  /* routine called after each event */



#ifdef __cplusplus
extern "C" {
#endif

void xv_init(int placa,int modo);
/* General inicialization */

Xv_opaque xv_create(xv_package obj_type);
/* Allocates and initializes with default values an object
   Returns its pointer, or NULL if there is not enough memory
   Allocates the "tbuffer" of the "tty"s with Pb=malloc(bsize+1)
*/

void item_create(const char *txt);
/* Creates an item for a menu or setting
   The items are enumerated from 0 (1 in Pascal)
   No memory is allocated
*/

void xv_main_loop(Xv_opaque w);
/* Opens a window and initates the loop wait event - process event */

void open_window(Xv_opaque w);
/* Opens or activates a window */

void close_window(Xv_opaque w);
/* Closes a window, erasing it from the screen */

void ttysw_output(Xv_opaque terminal, const char *texto);
/* Writes text to a terminal (tty) */

void Back(void);
/* Puts the active window behind the others */

void xv_set(Xv_opaque obj, char *new_label);
/* Changes the label of an object, redrawing it. Opens the object window */

void menu_show(Xv_opaque obj);
/* Opens a menu at the mouse position */

void draw_object(Xv_opaque obj, int complete);
/* Redraws an object */

void nothing(Xv_opaque obj);
/* Default "notify_handler" and "event-handler". No action */

void nointerpose(void);
/* Default "interposer". No action. */

void wait_button(void);
/* Waits until the mouse buttons are released */

void drawbitmap(int x,int y,int* dw, int* dh, ptrfig *Pimg, const char *filename);
/* Draws a Window 16 colors bitmap */
/* The filename shall use "/" or "\\" as directory separator */

/* The routines below are for operations with large images */

#ifdef __TURBOC__
long int figuresize(int x1,int y1,int x2,int y2);
/* Memory needed for an image */
#endif

ptrfig getfiguremem(int dw,int dh);
/* Allocates memory for image. "dw" e "dh" are width-1 and height-1
Returns a pointer to a "figstruct" structure, or NULL. Note that the
Pascal version is different */

void freefiguremem(ptrfig p);
/* Frees memory allocated for an image */

void getfigure(int x1,int y1,int x2,int y2,ptrfig p);
/* Captures an image from the screen */

void putfigure(int x,int y,ptrfig p,unsigned int bitblt);
/* Draws a figure in the screen */

#ifdef __cplusplus
}
#endif

#endif

