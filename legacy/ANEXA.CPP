

	// this file contains some tiny little functions, substitutes some
	// from MATH.H because they are not the way we would like ...


	#ifndef _ANEXA_H
	#include "anexa.h"
	#endif


	float	ABS( float number )
	{
			if( number <= 0 )
				return ( float )( (-1)*number );
			else
				return number;
	}




	int		SGN( float number )
	{
			if( number >= 0 )
				return 1;
			else
				return -1;
	}